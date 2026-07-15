// Remote langkey map: fetched from the public GitHub repo so users always get
// fresh data without reinstalling. Falls back to cached copy, then bundled file.
const MAP_URL =
	'https://raw.githubusercontent.com/yuuliao/langkey-finder/main/langkey-map.json'
const CACHE_TTL = 10 * 60 * 1000 // re-fetch at most every 10 minutes

const getMap = async () => {
	const { lkMap, lkFetchedAt } = await chrome.storage.local.get([
		'lkMap',
		'lkFetchedAt',
	])
	if (lkMap && lkFetchedAt && Date.now() - lkFetchedAt < CACHE_TTL) return lkMap
	try {
		const res = await fetch(MAP_URL, { cache: 'no-cache' })
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		const data = await res.json()
		// strip fields the UI doesn't need before caching
		for (const info of Object.values(data.map || {})) delete info.files
		delete data.githubBase
		await chrome.storage.local.set({ lkMap: data, lkFetchedAt: Date.now() })
		return data
	} catch (e) {
		console.warn('[LangkeyFinder] map fetch failed, using cache/bundled', e)
		return lkMap || null
	}
}

const inject = async tabId => {
	const map = await getMap()
	if (map) {
		await chrome.scripting.executeScript({
			target: { tabId },
			world: 'MAIN',
			func: data => {
				window.__LK_MAP = data
			},
			args: [map],
		})
	} else {
		// offline on first ever use: fall back to the bundled snapshot
		await chrome.scripting.executeScript({
			target: { tabId },
			files: ['langkey-map.js'],
			world: 'MAIN',
		})
	}
	await chrome.scripting.executeScript({
		target: { tabId },
		files: ['inject.js'],
		world: 'MAIN',
	})
}

chrome.action.onClicked.addListener(tab => {
	if (tab.id) inject(tab.id)
})

chrome.commands.onCommand.addListener(async command => {
	if (command !== 'toggle-finder') return
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	if (tab?.id) inject(tab.id)
})
