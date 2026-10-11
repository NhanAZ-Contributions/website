import MiniSearch from 'minisearch'

// Local search inspired by DocSearch's relevance criteria. No hosted service.
function plainText(value = '') {
  // VitePress already strips HTML when building the index. Preserve literal
  // code such as <port number you want>; Vue escapes it when rendering.
  return String(value).replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g,
    entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&nbsp;': ' ' })[entity])
    .replace(/\s+/g, ' ').trim()
}

// Keep identifiers intact: plugin.yml, opcache.so and configuration keys.
function tokenize(text) {
  return plainText(text).toLowerCase().match(/[\p{L}\p{N}]+(?:[._:/\\-][\p{L}\p{N}]+)*/gu) ?? []
}

function termForms(term) {
  const paths = term.split(/[:/\\]/)
  const parts = paths.flatMap(part => part.split('.'))
  return [...new Set([term, ...paths, ...parts, ...parts.flatMap(part => part.split(/[_-]/))])]
}

export const searchIndexOptions = {
  fields: ['title', 'titles', 'text'],
  storeFields: ['title', 'titles', 'text'],
  tokenize,
  // Expand indexed identifiers; keep each query token intact.
  processTerm: (term, field) => field ? termForms(term) : term
}

// Loaded indexes are immutable; reuse their vocabulary for typo-prefix lookup.
const prefixVocabulary = new WeakMap()

function fuzzyPrefixWords(index, term) {
  if (!typoLimit(term)) return []
  if (!prefixVocabulary.has(index)) {
    const words = index.search(MiniSearch.wildcard).flatMap(result =>
      tokenize(`${result.title ?? ''} ${(result.titles ?? []).join(' ')} ${result.text ?? ''}`).flatMap(termForms))
    prefixVocabulary.set(index, [...new Set(words)])
  }
  return prefixVocabulary.get(index).filter(word => matchWord(term, word, true, true))
}

function typoLimit(term) {
  if (!/^[a-z]{5,}$/.test(term)) return 0
  return term.length >= 8 ? 2 : 1
}

// Damerau-Levenshtein recognizes adjacent transpositions.
function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1))
  for (let i = 0; i <= a.length; i++) rows[i][0] = i
  for (let j = 0; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
      }
    }
  }
  return rows[a.length][b.length]
}

function matchWord(term, word, prefix, fuzzy) {
  if (term === word) return { typos: 0, exact: true }
  if (prefix && word.startsWith(term)) return { typos: 0, exact: false }
  const limit = fuzzy ? typoLimit(term) : 0
  if (!limit || !/^[a-z]{4,}$/.test(word) || term[0] !== word[0]) return null
  let edits = Math.abs(term.length - word.length) <= limit ? distance(term, word) : Infinity
  if (prefix && word.length > term.length) {
    for (let length = Math.max(4, term.length - limit); length <= Math.min(word.length, term.length + limit); length++) {
      edits = Math.min(edits, distance(term, word.slice(0, length)))
    }
  }
  return edits <= limit ? { typos: edits, exact: false } : null
}

function compare(a, b) {
  for (let i = 0; i < a.rank.length; i++) {
    if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i]
  }
  return a.id.localeCompare(b.id)
}

function proximity(tokens, matches) {
  // Find the smallest window covering every matched query term.
  const positions = tokens.flatMap((word, position) => matches.flatMap((m, term) =>
    m?.words.includes(word) ? [{ position, term }] : []))
  const required = matches.filter(Boolean).length
  const counts = new Map()
  let left = 0, best = 10000
  for (let right = 0; right < positions.length; right++) {
    const term = positions[right].term
    counts.set(term, (counts.get(term) ?? 0) + 1)
    while (counts.size === required && left <= right) {
      best = Math.min(best, positions[right].position - positions[left].position)
      const first = positions[left++].term
      counts.set(first, counts.get(first) - 1)
      if (!counts.get(first)) counts.delete(first)
    }
  }
  return best
}

function rankResult(result, terms, prefixes, fuzzy, phrases) {
  const originalFields = [tokenize(result.title), tokenize(result.titles?.[0] ?? ''),
    tokenize((result.titles ?? []).join(' ')), tokenize(result.text)]
  if (phrases.some(phrase => !originalFields.some(field => (' ' + field.join(' ') + ' ').includes(' ' + phrase.join(' ') + ' ')))) return null
  const fields = originalFields.map(field => field.flatMap(termForms))
  const vocabulary = [...new Set(fields.flat())]
  const matches = terms.map((term, i) => {
    const choices = vocabulary.flatMap(word => {
      const match = matchWord(term, word, prefixes[i], fuzzy)
      return match ? [{ word, ...match }] : []
    }).sort((a, b) => a.typos - b.typos || Number(b.exact) - Number(a.exact))
    if (!choices.length) return null
    const best = choices[0]
    return { ...best, words: choices.filter(c => c.typos === best.typos).map(c => c.word) }
  })
  const matched = matches.filter(Boolean).length
  if (!matched) return null
  const containsAll = field => matches.filter(Boolean).every(m => field.some(word => m.words.includes(word)))
  const titlePhrase = fields[0].some((_, start) => terms.every((term, i) =>
    fields[0][start + i] && matchWord(term, fields[0][start + i], prefixes[i], false)))
    && matched === terms.length
  const attribute = titlePhrase ? 0 : containsAll(fields[0]) ? 1 : containsAll(fields[1]) ? 2
    : containsAll(fields[2]) ? 3 : containsAll([...fields[0], ...fields[2]]) ? 4 : 5
  return {
    id: result.id,
    title: plainText(result.title),
    titles: (result.titles ?? []).map(plainText),
    text: plainText(result.text),
    matched,
    matchTerms: [...new Set(matches.filter(Boolean).flatMap(m => m.words))],
    unmatched: terms.filter((_, i) => !matches[i]),
    rank: [-matched, matches.reduce((sum, m) => sum + (m?.typos ?? 0), 0), attribute,
      Math.min(...fields.map(field => proximity(field, matches))),
      -matches.filter(m => m?.exact).length, result.titles?.length ?? 0, -result.score]
  }
}

export function searchDocumentation(index, query, { limit = 20, perPage = 4 } = {}) {
  const terms = [...new Set(tokenize(query))]
  const empty = { groups: [], mode: 'empty', unmatched: [] }
  if (!terms.length || !index) return empty
  const phrases = [...query.matchAll(/"([^"]+)"/g)].map(m => tokenize(m[1]))
  const prefixes = terms.map((term, i) => i === terms.length - 1 && term.length >= 2
    && !/\s$/.test(query) && !phrases.some(phrase => phrase.includes(term)))
  const find = (fuzzy, combineWith) => {
    const last = terms.length - 1
    const completions = fuzzy && prefixes[last] ? fuzzyPrefixWords(index, terms[last]) : []
    const query = completions.length ? {
      combineWith,
      queries: [
        ...terms.slice(0, -1).map(term => ({ queries: [term], prefix: false })),
        { queries: completions, combineWith: 'OR', prefix: false, fuzzy: false }
      ]
    } : terms.join(' ')
    return index.search(query, {
      combineWith,
      prefix: (_, i) => prefixes[i],
      // MiniSearch uses Levenshtein: fetch a wider candidate set for transpositions,
      // then enforce our stricter Damerau-Levenshtein limit in rankResult.
      fuzzy: term => fuzzy ? typoLimit(term) * 2 : false,
      boost: { title: 4, titles: 2, text: 1 }
    }).map(result => rankResult(result, terms, prefixes, fuzzy, phrases))
      .filter(Boolean).sort(compare)
  }

  let mode = 'full'
  let results = find(false, 'AND').filter(r => r.matched === terms.length)
  if (!results.length) {
    results = find(true, 'AND').filter(r => r.matched === terms.length)
    mode = 'typo'
  }
  if (!results.length && terms.length > 1 && !phrases.length) {
    // Related results are a separate, explicitly labelled fallback.
    results = find(false, 'OR').filter(r => r.matched >= Math.ceil(terms.length / 2))
    mode = 'related'
  }
  if (!results.length) return empty

  const pages = new Map()
  let count = 0
  for (const result of results) {
    if (count >= limit) break
    const page = result.id.split('#')[0]
    let group = pages.get(page)
    if (!group) {
      group = { page, title: result.titles[0] || result.title, results: [] }
      pages.set(page, group)
    }
    if (group.results.length >= perPage) continue
    group.results.push(result)
    count++
  }
  return { groups: [...pages.values()], mode,
    unmatched: mode === 'related' ? results[0].unmatched : [] }
}

export function excerpt(result, length = 180) {
  const text = plainText(result.text)
  const lower = text.toLowerCase()
  const positions = result.matchTerms.map(term => lower.indexOf(term)).filter(i => i >= 0)
  let start = positions.length ? Math.max(0, Math.min(...positions) - 50) : 0
  if (start > 0) {
    const boundary = text.indexOf(' ', start)
    if (boundary >= 0 && boundary < start + 25) start = boundary + 1
  }
  const end = Math.min(text.length, start + length)
  return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

export function highlight(text, terms) {
  const escaped = [...terms].sort((a, b) => b.length - a.length)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!escaped.length) return [{ text, marked: false }]
  const regex = new RegExp('(' + escaped.join('|') + ')', 'gi')
  return text.split(regex).filter(Boolean).map(part => ({ text: part,
    marked: terms.some(term => term.toLowerCase() === part.toLowerCase()) }))
}
