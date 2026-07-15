;(() => {
	const existing = document.getElementById('__lk_finder')
	if (existing) {
		if (existing.__lk_cleanup) existing.__lk_cleanup()
		else existing.remove()
		return
	}

	const app = document.getElementById('app')?.__vue_app__
	if (!app) {
		alert('Vue app not found (need #app with __vue_app__)')
		return
	}
	const provides = app._context.provides
	const sym = Object.getOwnPropertySymbols(provides).find(
		s => provides[s]?.global?.messages,
	)
	if (!sym) {
		alert('vue-i18n instance not found')
		return
	}
	const composer = provides[sym].global
	const locales = Object.keys(composer.messages.value)

	const flat = {}
	locales.forEach(l => {
		flat[l] = []
		const walk = (o, p = []) => {
			if (!o || typeof o !== 'object') return
			for (const [k, v] of Object.entries(o)) {
				if (typeof v === 'string') flat[l].push([p.concat(k).join('.'), v])
				else walk(v, p.concat(k))
			}
		}
		walk(composer.messages.value[l])
	})

	let cur = composer.locale.value
	if (!flat[cur]) cur = locales[0]
	let currentHits = []
	let probed = null

	// runtime vue-router (for "本頁 keys"); may be null on non-router pages
	const $router = app.config?.globalProperties?.$router || null

	// reverse index: route path -> Set<langkey>, from the static map
	const LK_MAP0 = (window.__LK_MAP && window.__LK_MAP.map) || null
	const routeToKeys = new Map()
	if (LK_MAP0) {
		for (const [k, info] of Object.entries(LK_MAP0)) {
			for (const r of info.routes || []) {
				if (!routeToKeys.has(r)) routeToKeys.set(r, new Set())
				routeToKeys.get(r).add(k)
			}
		}
	}

	// keys whose route set matches a path query (prefix) or an exact route list
	const keysForRoutePrefix = prefix => {
		const out = new Set()
		for (const [r, keys] of routeToKeys) {
			if (r === prefix || r.startsWith(prefix.replace(/\/$/, '') + '/')) {
				for (const k of keys) out.add(k)
			}
		}
		return out
	}
	const keysForRoutes = routes => {
		const out = new Set()
		for (const r of routes) {
			const ks = routeToKeys.get(r)
			if (ks) for (const k of ks) out.add(k)
		}
		return out
	}

	const el = document.createElement('div')
	el.id = '__lk_finder'
	el.style.cssText = [
		'position:fixed',
		'top:20px',
		'right:20px',
		'width:480px',
		'max-height:75vh',
		'background:#fff',
		'border:1px solid #ccc',
		'border-radius:8px',
		'box-shadow:0 4px 20px rgba(0,0,0,.2)',
		'z-index:2147483647',
		'font:13px system-ui,-apple-system,sans-serif',
		'color:#222',
		'display:flex',
		'flex-direction:column',
	].join(';')

	el.innerHTML = `
		<div id="__lk_head" style="padding:10px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:8px;cursor:move;user-select:none">
			<div style="flex:1;line-height:1.3">
				<strong>🔍 Find Langkey</strong>
				<div style="font-size:10px;color:#999;font-weight:normal">${
					window.__LK_MAP && window.__LK_MAP.generatedAt
						? `route 資料更新：${window.__LK_MAP.generatedAt}`
						: 'route 對照表未載入'
				}</div>
			</div>
			<select id="__lk_loc" style="padding:2px 4px;font:inherit">
				${locales.map(l => `<option ${l === cur ? 'selected' : ''}>${l}</option>`).join('')}
			</select>
			<button id="__lk_x" style="border:0;background:none;cursor:pointer;font-size:18px;line-height:1;padding:0 4px">×</button>
		</div>
		<input id="__lk_in" placeholder="輸入文字 / key / 路徑（/ 開頭）…" style="margin:8px 8px 4px;padding:6px 8px;border:1px solid #ccc;border-radius:4px;outline:none;font:inherit"/>
		<div id="__lk_bar" style="margin:0 8px 4px;display:flex;align-items:center;gap:8px;font-size:12px;color:#666;flex-wrap:wrap">
			<button id="__lk_probe" style="border:1px solid #ccc;background:#fff;cursor:pointer;font:inherit;padding:3px 8px;border-radius:4px">🎯 Probe page</button>
			<button id="__lk_thispage" style="border:1px solid #ccc;background:#fff;cursor:pointer;font:inherit;padding:3px 8px;border-radius:4px">📄 Page keys</button>
			<span id="__lk_probe_msg"></span>
		</div>
		<div id="__lk_r" style="overflow-y:auto;padding:0 8px 8px"></div>
	`
	document.body.appendChild(el)

	// document-level listeners are tracked so closing the panel removes them
	// (previously they leaked on every toggle)
	const docListeners = []
	const onDoc = (type, fn) => {
		document.addEventListener(type, fn)
		docListeners.push([type, fn])
	}
	const cleanup = () => {
		docListeners.forEach(([t, f]) => document.removeEventListener(t, f))
		el.remove()
	}
	el.__lk_cleanup = cleanup

	const inp = el.querySelector('#__lk_in')
	const res = el.querySelector('#__lk_r')
	const sel = el.querySelector('#__lk_loc')
	const head = el.querySelector('#__lk_head')
	const probeBtn = el.querySelector('#__lk_probe')
	const thisPageBtn = el.querySelector('#__lk_thispage')
	const probeMsg = el.querySelector('#__lk_probe_msg')

	const LK_MAP = (window.__LK_MAP && window.__LK_MAP.map) || null

	// Build the "used on which route(s)" line for a key.
	const routeLine = k => {
		const info = LK_MAP && LK_MAP[k]
		if (!info || !info.routes || !info.routes.length) {
			return `<span style="color:#b58900">🌀 動態／未收錄</span>`
		}
		if (info.shared) {
			return `<span style="color:#888" title="${escHtml(info.routes.join('\n'))}">🌐 全站共用（${info.routes.length} 頁）</span>`
		}
		return info.routes
			.map(r => {
				const openable = !r.includes(':')
				const href = openable ? location.origin + r : null
				return href
					? `<a href="${escHtml(href)}" target="_blank" style="color:#0a7d32;text-decoration:none;background:#eef8f0;padding:0 5px;border-radius:3px;margin-right:4px;display:inline-block">${escHtml(r)}</a>`
					: `<span style="color:#0a7d32;background:#eef8f0;padding:0 5px;border-radius:3px;margin-right:4px;display:inline-block" title="動態路由">${escHtml(r)}</span>`
			})
			.join('')
	}

	const escHtml = s =>
		s.replace(
			/[&<>]/g,
			m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m],
		)

	const setNested = (obj, path, value) => {
		const parts = path.split('.')
		let cur1 = obj
		for (let i = 0; i < parts.length - 1; i++) {
			if (!cur1[parts[i]] || typeof cur1[parts[i]] !== 'object') {
				cur1[parts[i]] = {}
			}
			cur1 = cur1[parts[i]]
		}
		cur1[parts[parts.length - 1]] = value
	}

	const getNested = (obj, path) => {
		const parts = path.split('.')
		let cur1 = obj
		for (const p of parts) {
			if (cur1 == null) return undefined
			cur1 = cur1[p]
		}
		return cur1
	}

	const wait2Frames = () =>
		new Promise(r =>
			requestAnimationFrame(() => requestAnimationFrame(r)),
		)

	const probe = async candidates => {
		const probeTree = {}
		const restoreTree = {}
		const markers = {}
		const allMsgs = composer.messages.value[cur]

		for (const k of candidates) {
			const orig = getNested(allMsgs, k)
			if (typeof orig !== 'string') continue
			const marker = `__LKP_${Math.random().toString(36).slice(2, 8)}__`
			markers[k] = marker
			setNested(probeTree, k, marker)
			setNested(restoreTree, k, orig)
		}

		composer.mergeLocaleMessage(cur, probeTree)
		await wait2Frames()

		const html = document.body.outerHTML
		const found = {}
		for (const k of Object.keys(markers)) {
			found[k] = html.includes(markers[k])
		}

		composer.mergeLocaleMessage(cur, restoreTree)
		await wait2Frames()

		return found
	}

	// When set (by 📄 本頁 keys), render restricts to this key set instead of text.
	let explicitKeys = null
	let explicitNote = ''

	const render = q => {
		let note = ''
		let routeMode = false
		if (explicitKeys) {
			routeMode = true
			currentHits = flat[cur].filter(([k]) => explicitKeys.has(k)).slice(0, 500)
			note = explicitNote
		} else if (q && q.startsWith('/')) {
			// path search: keys whose route matches the typed path (prefix)
			routeMode = true
			const prefix = q.trim()
			const wanted = keysForRoutePrefix(prefix)
			currentHits = flat[cur].filter(([k]) => wanted.has(k)).slice(0, 500)
			note = `📄 路徑 <b>${escHtml(prefix)}</b> · ${currentHits.length} keys`
			if (!currentHits.length) {
				// suggest routes so the user can discover what's searchable
				const sugg = [...routeToKeys.keys()]
					.filter(r => r.includes(prefix) || prefix === '/')
					.sort()
					.slice(0, 15)
				res.innerHTML =
					`<div style="color:#999;padding:8px">${note} · 無結果${sugg.length ? '，可搜尋的 route：' : ''}</div>` +
					sugg
						.map(
							r =>
								`<div class="__lk_route_sugg" data-r="${escHtml(r)}" style="padding:4px 8px;color:#0a7d32;cursor:pointer">${escHtml(r)} <span style="color:#aaa">(${routeToKeys.get(r).size})</span></div>`,
						)
						.join('')
				res.querySelectorAll('.__lk_route_sugg').forEach(d => {
					d.onclick = () => {
						inp.value = d.dataset.r
						render(d.dataset.r)
					}
				})
				return
			}
		} else if (!q) {
			res.innerHTML = `<div style="color:#999;padding:8px">${flat[cur].length} keys · 輸入文字，或 / 開頭搜路徑</div>`
			currentHits = []
			return
		} else {
			const ql = q.toLowerCase()
			const all = flat[cur].filter(
				([k, v]) =>
					v.toLowerCase().includes(ql) || k.toLowerCase().includes(ql),
			)
			currentHits = all.slice(0, 200)
			if (all.length > 200) note = `共 ${all.length} 筆，顯示前 200 筆`
		}
		if (!currentHits.length) {
			res.innerHTML =
				`<div style="color:#999;padding:8px">${note || '無結果'}${note ? ' · 無結果' : ''}</div>`
			return
		}
		// route mode: page-specific keys first, site-wide shared last
		if (routeMode && LK_MAP) {
			currentHits = [...currentHits].sort((a, b) => {
				const ra = LK_MAP[a[0]]?.routes?.length ?? 999
				const rb = LK_MAP[b[0]]?.routes?.length ?? 999
				return ra - rb
			})
		}
		const noteHtml = note
			? `<div style="color:#666;padding:6px 4px;font-size:12px;border-bottom:1px solid #eee">${note}</div>`
			: ''

		const sorted = probed
			? [...currentHits].sort((a, b) => {
					const ap = probed[a[0]] ? 1 : 0
					const bp = probed[b[0]] ? 1 : 0
					return bp - ap
				})
			: currentHits

		res.innerHTML = noteHtml + sorted
			.map(([k, v]) => {
				const onPage = probed && probed[k]
				const bg = onPage ? 'background:#f0fff0;' : ''
				const badge = onPage
					? `<span style="display:inline-block;margin-left:6px;padding:0 6px;font-size:11px;background:#0a0;color:#fff;border-radius:3px;vertical-align:middle">on page</span>`
					: ''
				return `
					<div class="__lk_row" data-k="${escHtml(k)}" style="${bg}padding:6px 6px;border-bottom:1px solid #f0f0f0;cursor:pointer">
						<div style="color:#0066cc;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all">${escHtml(k)}${badge}</div>
						<div style="color:#666;margin-top:2px">${escHtml(v)}</div>
						<div style="margin-top:3px;font-size:11px;line-height:1.7">${routeLine(k)}</div>
					</div>
				`
			})
			.join('')

	}

	// row click -> copy key (delegated once instead of per-row handlers)
	res.addEventListener('click', e => {
		if (e.target.closest('a')) return // let route links work
		const row = e.target.closest('.__lk_row')
		if (!row) return
		navigator.clipboard.writeText(row.dataset.k)
		const origBg = row.style.background
		row.style.background = '#dfd'
		setTimeout(() => {
			row.style.background = origBg
		}, 500)
	})

	probeBtn.onclick = async () => {
		if (!currentHits.length) {
			probeMsg.textContent = '先搜尋'
			return
		}
		probeBtn.disabled = true
		probeBtn.textContent = 'Probing…'
		probeMsg.textContent = ''
		try {
			const candidates = currentHits.map(([k]) => k)
			probed = await probe(candidates)
			const onPageCount = Object.values(probed).filter(Boolean).length
			probeMsg.textContent = `${onPageCount} / ${candidates.length} 在頁面上`
			render(inp.value)
		} catch (err) {
			console.error('[LangkeyFinder] probe error', err)
			probeMsg.textContent = '錯誤，看 console'
		} finally {
			probeBtn.disabled = false
			probeBtn.textContent = '🎯 Probe page'
		}
	}

	// 📄 本頁 keys — list langkeys the static map attributes to the current route
	thisPageBtn.onclick = () => {
		if (!routeToKeys.size) {
			probeMsg.textContent = 'route 對照表未載入'
			return
		}
		let paths = []
		const matched = $router?.currentRoute?.value?.matched
		if (matched && matched.length) {
			paths = matched.map(m => m.path).filter(Boolean)
		}
		if (!paths.length) {
			probeMsg.textContent = '取不到當前 route'
			return
		}
		const keys = keysForRoutes(paths)
		explicitKeys = keys
		explicitNote = `📄 本頁 <b>${escHtml(paths[paths.length - 1])}</b> · ${keys.size} keys（不含動態拼接的 key）`
		probed = null
		probeMsg.textContent = ''
		render('')
	}

	let inputTimer = null
	inp.oninput = e => {
		explicitKeys = null
		probed = null
		probeMsg.textContent = ''
		clearTimeout(inputTimer)
		inputTimer = setTimeout(() => render(e.target.value), 120)
	}
	sel.onchange = e => {
		cur = e.target.value
		probed = null
		probeMsg.textContent = ''
		render(inp.value)
	}
	el.querySelector('#__lk_x').onclick = cleanup
	onDoc('keydown', e => {
		if (e.key === 'Escape' && document.body.contains(el)) cleanup()
	})

	let dragging = false
	let offX = 0
	let offY = 0
	head.addEventListener('mousedown', e => {
		if (e.target.closest('button,select,input')) return
		dragging = true
		const r = el.getBoundingClientRect()
		offX = e.clientX - r.left
		offY = e.clientY - r.top
		el.style.right = 'auto'
	})
	onDoc('mousemove', e => {
		if (!dragging) return
		el.style.left = `${e.clientX - offX}px`
		el.style.top = `${e.clientY - offY}px`
	})
	onDoc('mouseup', () => {
		dragging = false
	})

	inp.focus()
	render('')
})()
