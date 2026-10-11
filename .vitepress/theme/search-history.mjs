const recentSearchKey = 'axolotl:recent-searches:v1'
const favoriteSearchKey = 'axolotl:favorite-searches:v1'
const recentSearchLimit = 8

function normalize(entries, limit = recentSearchLimit) {
  if (!Array.isArray(entries)) return []
  const ids = new Set()
  return entries.filter(entry => {
    if (!entry || typeof entry.id !== 'string' || typeof entry.title !== 'string'
      || typeof entry.pageTitle !== 'string' || !entry.title.trim()
      || !entry.id.startsWith('/') || entry.id.startsWith('//')
      || /[\\\u0000-\u001f]/.test(entry.id) || entry.id.length > 600 || ids.has(entry.id)) return false
    ids.add(entry.id)
    return true
  }).slice(0, limit).map(({ id, title, pageTitle }) => ({
    id, title: title.slice(0, 300), pageTitle: pageTitle.slice(0, 300)
  }))
}

export function readFavoriteSearches(storage) {
  try { return normalize(JSON.parse(storage?.getItem(favoriteSearchKey) ?? '[]'), Infinity) }
  catch { return [] }
}

export function toggleFavoriteSearch(entries, entry) {
  return normalize(entries.some(item => item.id === entry.id)
    ? entries.filter(item => item.id !== entry.id) : [entry, ...entries], Infinity)
}

export function saveFavoriteSearches(storage, entries) {
  try { storage?.setItem(favoriteSearchKey, JSON.stringify(normalize(entries, Infinity))) }
  catch {}
}

export function savedSearchGroups(recent, favorites) {
  const favoriteIds = new Set(favorites.map(entry => entry.id))
  return [
    { kind: 'recent', title: 'Recent searches', entries: recent.filter(entry => !favoriteIds.has(entry.id)) },
    { kind: 'favorite', title: 'Favorites', entries: favorites }
  ].filter(group => group.entries.length)
}

export function readRecentSearches(storage) {
  try { return normalize(JSON.parse(storage?.getItem(recentSearchKey) ?? '[]')) }
  catch { return [] }
}

export function rememberSearchResult(entries, entry) {
  return normalize([entry, ...entries.filter(item => item.id !== entry.id)])
}

export function saveRecentSearches(storage, entries) {
  // Search and navigation still work if storage is unavailable or full.
  try { storage?.setItem(recentSearchKey, JSON.stringify(normalize(entries))) }
  catch {}
}
