#!/usr/bin/env node
// Build a static langkey -> route(s) lookup table for the Langkey Finder extension.
//
//   node tools/build-map.mjs [repoPath]
//
// Default repoPath: /Users/Yu/Project/bns-web-member
// Output: ../langkey-map.json (next to inject.js)
//
// How it works (all static, no runtime):
//   1. Scan every src/**/*.{vue,ts,tsx} for referenced langkeys (t('..'), $t('..'),
//      i18n-t keypath="..") -> key -> Set<file>.
//   2. Scan the same files for imported .vue components -> build "imported by" graph.
//   3. Parse src/router/index.ts (brace-depth walk) -> file -> Set<routePath>.
//   4. Resolve each referencing file to the route(s) that render it (self if routed,
//      else walk up the import graph to routed ancestors).
//   5. Emit key -> { routes, files, shared } for every statically-referenced key.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = process.argv[2] || '/Users/Yu/Project/bns-web-member'
const SRC = join(REPO, 'src')
const OUT = join(__dirname, '..', 'langkey-map.json')
const OUT_JS = join(__dirname, '..', 'langkey-map.js')
const GITHUB_BASE = 'https://github.com/buyandship/bns-web-member/blob/master'
// If a file/component resolves to more routes than this, treat it as site-wide shared.
const SHARED_THRESHOLD = 8

// ---- collect source files ------------------------------------------------
const files = []
;(function walk(dir) {
	for (const name of readdirSync(dir)) {
		if (name === 'node_modules' || name === 'tests' || name.startsWith('.')) continue
		const p = join(dir, name)
		const st = statSync(p)
		if (st.isDirectory()) walk(p)
		else if (/\.(vue|ts|tsx)$/.test(name)) files.push(p)
	}
})(SRC)

const read = p => readFileSync(p, 'utf8')
const rel = p => relative(REPO, p)

// ---- load the full set of valid langkeys from the locale file ------------
const validKeys = new Set()
{
	const langSrc = read(join(SRC, 'lang', 'zh_HK.js'))
	const re = /["']([a-zA-Z0-9_]+)["']\s*:/g
	let m
	while ((m = re.exec(langSrc))) validKeys.add(m[1])
}

// ---- resolve an import specifier to an absolute file path ----------------
function resolveImport(spec, fromFile) {
	if (!spec.endsWith('.vue')) return null
	let base
	if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
	else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
	else return null
	return base
}

// ---- pass 1: key references + import edges -------------------------------
const keyToFiles = new Map() // key -> Set<absFile>
const importedBy = new Map() // childAbs -> Set<parentAbs>
const dynamicPrefixes = new Set() // literal prefixes of template-built keys

const KEY_RE = /(?:\$?t|keypath\s*=\s*)\(?\s*['"]([a-zA-Z0-9_]+)['"]/g
// keypath uses = "..." not (...) ; handle both t('x') and keypath="x"
const KEY_RE2 = /keypath\s*=\s*['"]([a-zA-Z0-9_]+)['"]/g
const TFUNC_RE = /\$?t\(\s*['"]([a-zA-Z0-9_]+)['"]/g
const IMPORT_RE = /(?:import\(\s*|from\s+)['"]([^'"]+\.vue)['"]/g
const RAWKEY_RE = /['"]([a-zA-Z0-9_]+)['"]/g
// dynamic key construction: t(`some_prefix_${x}`) -> collect "some_prefix_"
const DYNKEY_RE = /\$?t\(\s*`([a-zA-Z0-9_]+)\$\{/g

for (const f of files) {
	const src = read(f)
	const add = key => {
		if (!keyToFiles.has(key)) keyToFiles.set(key, new Set())
		keyToFiles.get(key).add(f)
	}
	let m
	TFUNC_RE.lastIndex = 0
	while ((m = TFUNC_RE.exec(src))) add(m[1])
	KEY_RE2.lastIndex = 0
	while ((m = KEY_RE2.exec(src))) add(m[1])
	// Also attribute any bare quoted string that exactly matches a known langkey
	// (recovers config-array keys like payment_option_online that reach t() later).
	RAWKEY_RE.lastIndex = 0
	while ((m = RAWKEY_RE.exec(src))) if (validKeys.has(m[1])) add(m[1])
	DYNKEY_RE.lastIndex = 0
	while ((m = DYNKEY_RE.exec(src))) if (m[1].length >= 3) dynamicPrefixes.add(m[1])
	IMPORT_RE.lastIndex = 0
	while ((m = IMPORT_RE.exec(src))) {
		const child = resolveImport(m[1], f)
		if (!child) continue
		if (!importedBy.has(child)) importedBy.set(child, new Set())
		importedBy.get(child).add(f)
	}
}

// ---- pass 2: parse router into file -> Set<routePath> --------------------
const routerSrc = read(join(SRC, 'router', 'index.ts'))
const fileToRoutes = new Map() // absFile -> Set<routePath>

;(function parseRouter() {
	// Brace-depth walk. Each `{` pushes a frame; `path:` sets the frame's path;
	// a `.vue` import inside a frame maps that file to the joined path chain.
	const stack = [] // frames: { path: string|null }
	const s = routerSrc
	// tokenize just enough: iterate chars, but detect path:/import via regex around positions
	// Simpler: line-ish scan with running brace depth.
	let i = 0
	const pathAt = [] // path value per depth
	let depth = 0
	function joinedPath() {
		const parts = pathAt.slice(0, depth + 1).filter(p => p != null && p !== '')
		let full = '/' + parts.join('/')
		full = full.replace(/\/+/g, '/')
		if (full.length > 1 && full.endsWith('/')) full = full.slice(0, -1)
		return full
	}
	while (i < s.length) {
		const c = s[i]
		if (c === '{') {
			depth++
			pathAt[depth] = pathAt[depth - 1] ?? '' // inherit parent path by default
			i++
			continue
		}
		if (c === '}') {
			pathAt[depth] = undefined
			depth--
			i++
			continue
		}
		// match `path: '...'` or `path: "..."`
		const rest = s.slice(i, i + 200)
		let mm = /^path:\s*['"]([^'"]*)['"]/.exec(rest)
		if (mm) {
			// full path for this frame = parent chain + this value
			const parentParts = []
			for (let d = 1; d < depth; d++) if (pathAt[d] != null) parentParts.push(pathAt[d])
			let val = mm[1]
			pathAt[depth] = parentParts.concat(val.split('/').filter(Boolean)).join('/')
			i += mm[0].length
			continue
		}
		mm = /^import\(\s*['"]([^'"]+\.vue)['"]/.exec(rest)
		if (mm) {
			const abs = resolveImport(mm[1], join(SRC, 'router', 'index.ts'))
			if (abs) {
				let full = '/' + (pathAt[depth] || '')
				full = full.replace(/\/+/g, '/')
				if (full.length > 1 && full.endsWith('/')) full = full.slice(0, -1)
				if (!fileToRoutes.has(abs)) fileToRoutes.set(abs, new Set())
				fileToRoutes.get(abs).add(full)
			}
			i += mm[0].length
			continue
		}
		i++
	}
})()

// ---- pass 3: resolve any file to the routes that render it ---------------
const routeCache = new Map()
function resolveRoutes(file) {
	if (routeCache.has(file)) return routeCache.get(file)
	const out = new Set()
	const seen = new Set()
	const queue = [file]
	routeCache.set(file, out) // guard against import cycles
	while (queue.length) {
		const cur = queue.shift()
		if (seen.has(cur)) continue
		seen.add(cur)
		if (fileToRoutes.has(cur)) for (const r of fileToRoutes.get(cur)) out.add(r)
		const parents = importedBy.get(cur)
		if (parents) for (const p of parents) if (!seen.has(p)) queue.push(p)
	}
	return out
}

// ---- pass 4: emit key -> routes ------------------------------------------
const map = {}
for (const [key, fileSet] of keyToFiles) {
	const routes = new Set()
	const fileList = []
	for (const f of fileSet) {
		fileList.push(rel(f))
		for (const r of resolveRoutes(f)) routes.add(r)
	}
	const routeArr = [...routes].sort()
	map[key] = {
		routes: routeArr,
		files: fileList.sort(),
		shared: routeArr.length > SHARED_THRESHOLD,
	}
}

const now = new Date()
const pad = n => String(n).padStart(2, '0')
const generatedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`

// stamp the scanned repo state so a stale/wrong-branch map is diagnosable
let repoRef = 'unknown'
try {
	const branch = execSync('git branch --show-current', { cwd: REPO }).toString().trim()
	const commit = execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim()
	const dirty = execSync('git status --porcelain', { cwd: REPO }).toString().trim() ? '*' : ''
	repoRef = `${branch || 'detached'}@${commit}${dirty}`
} catch {}

const payload = {
	generatedFrom: 'bns-web-member',
	githubBase: GITHUB_BASE,
	generatedAt,
	repoRef,
	keyCount: Object.keys(map).length,
	map,
}
writeFileSync(OUT, JSON.stringify(payload))
// Extension payload: the UI only needs routes/shared per key — strip files/githubBase
// to roughly halve the injected script size.
const slimMap = Object.fromEntries(
	Object.entries(map).map(([k, { routes, shared }]) => [k, { routes, shared }]),
)
const slim = { generatedFrom: payload.generatedFrom, generatedAt, repoRef, keyCount: payload.keyCount, map: slimMap }
writeFileSync(OUT_JS, `window.__LK_MAP = ${JSON.stringify(slim)}\n`)

// ---- report --------------------------------------------------------------
const withRoutes = Object.values(map).filter(m => m.routes.length).length
const sharedN = Object.values(map).filter(m => m.shared).length
console.log(`keys referenced statically : ${Object.keys(map).length}`)
console.log(`  with >=1 resolved route  : ${withRoutes}`)
console.log(`  site-wide shared (>${SHARED_THRESHOLD})    : ${sharedN}`)
console.log(`  no route resolved        : ${Object.keys(map).length - withRoutes}`)
// ---- unused-key report ----------------------------------------------------
// Keys present in the lang file but never referenced statically. Split into:
//   - "possibly dynamic": matches a t(`prefix_${...}`) prefix found in source
//   - "no reference at all": candidates for deletion
const unused = [...validKeys].filter(k => !keyToFiles.has(k)).sort()
const prefixes = [...dynamicPrefixes].sort()
const maybeDynamic = []
const dead = []
for (const k of unused) {
	const p = prefixes.find(p => k.startsWith(p))
	if (p) maybeDynamic.push([k, p])
	else dead.push(k)
}
const REPORT = join(__dirname, 'unused-keys.md')
const reportLines = [
	`# 疑似未使用的 langkey`,
	``,
	`產生時間：${generatedAt} · 掃描來源：${REPO}`,
	``,
	`lang 檔共 ${validKeys.size} 個 key，其中 ${unused.length} 個在原始碼找不到靜態引用。`,
	``,
	`> ⚠️ 注意：lang 檔來自 POEditor（fetch_langfile.py, project 745234）。`,
	`> 本清單只代表 **bns-web-member 這個 repo** 沒有引用；若該 POEditor 專案`,
	`> 還有其他消費端（App、其他 web repo），刪除前務必先確認跨專案使用情況。`,
	``,
	`## ⚠️ 可能動態使用（符合 t(\`prefix_\${x}\`) 樣板前綴，勿直接刪）— ${maybeDynamic.length} 個`,
	``,
	...maybeDynamic.map(([k, p]) => `- \`${k}\`（樣板前綴 \`${p}…\`）`),
	``,
	`## 🗑 完全查無引用（刪除候選，仍建議人工確認）— ${dead.length} 個`,
	``,
	...dead.map(k => `- \`${k}\``),
	``,
]
writeFileSync(REPORT, reportLines.join('\n'))

console.log(`generatedAt              : ${generatedAt}`)
console.log(`scanned repo state       : ${repoRef}${repoRef.endsWith('*') ? '  (⚠ 有未 commit 的變更)' : ''}`)
if (!repoRef.startsWith('main@') && !repoRef.startsWith('master@'))
	console.log(`⚠ 警告：repo 不在 main/master，對照表可能不符正式版！`)
console.log(`unused: maybe-dynamic    : ${maybeDynamic.length}`)
console.log(`unused: dead candidates  : ${dead.length}`)
console.log(`report -> ${REPORT}`)
console.log(`written -> ${OUT}`)
