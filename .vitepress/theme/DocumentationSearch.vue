<script setup lang="ts">
import localSearchIndex from '@localSearchIndex'
import MiniSearch from 'minisearch'
import { useData, useRouter } from 'vitepress'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { excerpt, highlight, searchDocumentation, searchIndexOptions } from './search-engine.mjs'
import { readRecentSearches, rememberSearchResult, saveRecentSearches,
  readFavoriteSearches, toggleFavoriteSearch, saveFavoriteSearches, savedSearchGroups } from './search-history.mjs'

const emit = defineEmits<{ close: [] }>()
type SavedSearch = { id: string; title: string; pageTitle: string }
const { localeIndex } = useData()
const router = useRouter()
const dialog = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const visible = ref(false)
const query = ref('')
const index = shallowRef<MiniSearch>()
const loading = ref(true)
const failed = ref(false)
const selected = ref(0)
const recent = ref<SavedSearch[]>([])
const favorites = ref<SavedSearch[]>([])
const favoriteIds = computed(() => new Set(favorites.value.map(entry => entry.id)))
const savedGroups = computed(() => savedSearchGroups(recent.value, favorites.value))
const savedRows = computed(() => savedGroups.value.flatMap(group => group.entries))
const showingRecent = computed(() => !query.value.trim())
const response = computed(() => searchDocumentation(index.value, query.value))
const rows = computed(() => showingRecent.value ? savedRows.value : response.value.groups.flatMap(group => group.results))
const contentState = computed(() => showingRecent.value ? 'recent'
  : loading.value ? 'loading' : failed.value ? 'failed' : rows.value.length ? 'results' : 'empty')
const rowIndices = computed(() => new Map(rows.value.map((row, i) => [row.id, i])))
const selectedId = computed(() => rows.value.length ? `search-result-${selected.value}` : undefined)
const countLabel = computed(() => showingRecent.value
  ? `${savedRows.value.length - favorites.value.length} recent · ${favorites.value.length} ${favorites.value.length === 1 ? 'favorite' : 'favorites'}`
  : `${rows.value.length} ${rows.value.length === 1 ? 'result' : 'results'} · ${response.value.groups.length} ${response.value.groups.length === 1 ? 'page' : 'pages'}`)
const resultMessage = computed(() => showingRecent.value ? countLabel.value
  : loading.value ? 'Loading search…' : failed.value ? 'Search could not load.' : countLabel.value)
let previousFocus: HTMLElement | null = null
let previousOverflow = ''
let app: HTMLElement | null = null
let previousInert = false
let loadVersion = 0
let indexLoaders = localSearchIndex
let historyStorage: Storage | undefined
let resizeAnimation: Animation | undefined

async function loadIndex() {
  const version = ++loadVersion
  loading.value = true
  failed.value = false
  try {
    const data = (await indexLoaders[localeIndex.value]?.())?.default
    if (!data) throw new Error('Missing search index')
    const loaded = MiniSearch.loadJSON(data, searchIndexOptions)
    if (version === loadVersion) index.value = loaded
  } catch {
    if (version === loadVersion) failed.value = true
  } finally {
    if (version === loadVersion) loading.value = false
  }
}

watch(localeIndex, loadIndex)
watch(query, () => { selected.value = 0 })
watch(rows, () => { selected.value = 0 })
watch([rows, loading, failed], resizeDialog)
watch(selected, scrollSelected)

async function scrollSelected() {
  await nextTick()
  dialog.value?.querySelector(`#${selectedId.value}`)?.scrollIntoView({ block: 'nearest' })
}

async function resizeDialog() {
  const element = dialog.value
  if (!element || !visible.value) return
  const from = element.getBoundingClientRect().height
  await nextTick()
  if (!element.isConnected || !visible.value) return
  resizeAnimation?.cancel()
  const to = element.getBoundingClientRect().height
  if (Math.abs(from - to) < 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  resizeAnimation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: 250, easing: 'ease'
  })
  resizeAnimation.finished.then(scrollSelected, () => {})
}

function close() { visible.value = false }
function reload() { window.location.reload() }
function reset() { query.value = ''; input.value?.focus() }
function onResultClick(event: MouseEvent, id: string) {
  // vp-raw links let this handler own navigation instead of VitePress's capture handler.
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey
    || event.shiftKey || event.altKey) return
  event.preventDefault()
  choose(id)
}
function choose(id: string) {
  const row = rows.value.find(row => row.id === id)
  if (row) {
    const entry = showingRecent.value ? row : { id: row.id, title: row.title,
      pageTitle: row.titles[0] || row.title }
    recent.value = rememberSearchResult(recent.value, entry)
    saveRecentSearches(historyStorage, recent.value)
  }
  router.go(id)
  close()
}
function removeRecent(id: string) {
  recent.value = recent.value.filter(entry => entry.id !== id)
  saveRecentSearches(historyStorage, recent.value)
  input.value?.focus()
}
async function toggleFavorite(entry: SavedSearch) {
  favorites.value = toggleFavoriteSearch(favorites.value, entry)
  saveFavoriteSearches(historyStorage, favorites.value)
  await nextTick()
  // Keep keyboard focus on the same star when the item changes groups.
  const star = [...(dialog.value?.querySelectorAll<HTMLButtonElement>('[data-favorite-id]') ?? [])]
    .find(button => button.dataset.favoriteId === entry.id)
  if (star) star.focus()
  else input.value?.focus()
}
function onKeydown(event: KeyboardEvent) {
  if (!visible.value || event.isComposing) return
  if (event.key === 'Escape') { event.preventDefault(); close() }
  else if (event.target === input.value && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && rows.value.length) {
    event.preventDefault()
    selected.value = (selected.value + (event.key === 'ArrowDown' ? 1 : -1) + rows.value.length) % rows.value.length
  } else if (event.key === 'Enter' && event.target === input.value) {
    event.preventDefault()
    if (rows.value[selected.value]) choose(rows.value[selected.value].id)
  } else if (event.key === 'Tab') {
    const controls = [...(dialog.value?.querySelectorAll<HTMLElement>('input, button, a[href]') ?? [])]
      .filter(el => !el.hasAttribute('disabled') && el.getClientRects().length)
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
}

onMounted(() => {
  try {
    historyStorage = window.localStorage
    recent.value = readRecentSearches(historyStorage)
    favorites.value = readFavoriteSearches(historyStorage)
  }
  catch { /* Private browsing can block access to localStorage. */ }
  previousFocus = document.activeElement as HTMLElement
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  app = document.querySelector('#app')
  if (app) { previousInert = app.inert; app.inert = true }
  visible.value = true
  nextTick(() => input.value?.focus())
  loadIndex()
})
onBeforeUnmount(() => {
  loadVersion++
  resizeAnimation?.cancel()
  document.body.style.overflow = previousOverflow
  if (app) app.inert = previousInert
  previousFocus?.focus()
})

if (import.meta.hot) {
  import.meta.hot.accept('/@localSearchIndex', (module) => {
    if (module) { indexLoaders = module.default; loadIndex() }
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="search-modal" @after-leave="emit('close')">
      <div v-if="visible" class="documentation-search" @click.self="close">
        <section ref="dialog" role="dialog" aria-modal="true" aria-labelledby="documentation-search-title"
          class="search-dialog" @keydown="onKeydown">
          <h2 id="documentation-search-title" class="sr-only">Search documentation</h2>
          <form class="search-form" @submit.prevent>
            <svg class="search-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" />
            </svg>
            <input ref="input" v-model="query" type="search" role="combobox" aria-label="Search documentation"
              aria-autocomplete="list" :aria-expanded="rows.length > 0" aria-controls="documentation-search-results"
              :aria-activedescendant="selectedId" placeholder="Search documentation…" maxlength="100"
              autocomplete="off" autocapitalize="off" autocorrect="off" :spellcheck="false" enterkeyhint="go" />
            <button v-if="query" class="search-clear" type="button" aria-label="Clear search" @click="reset">×</button>
            <button class="search-close" type="button" aria-label="Close search" @click="close">Close</button>
          </form>
          <div class="search-content">
            <p class="sr-only" role="status" aria-live="polite">{{ resultMessage }}</p>
            <div :key="contentState" class="search-reveal" @animationend.self="scrollSelected">
              <template v-if="showingRecent">
                <div v-if="!savedRows.length" class="search-empty">No recent searches</div>
                <div v-else id="documentation-search-results" role="listbox" aria-label="Recent searches and favorites" class="search-saved">
                  <section v-for="group in savedGroups" :key="group.kind" role="group" :aria-label="group.title">
                    <h3 class="search-group-title">{{ group.title }}</h3>
                    <ul role="presentation" class="search-history">
                    <li v-for="entry in group.entries" :key="entry.id" :id="`search-result-${rowIndices.get(entry.id)}`"
                      role="option" :aria-selected="selected === rowIndices.get(entry.id)">
                      <div class="search-history-row" :class="{ selected: selected === rowIndices.get(entry.id) }"
                        @pointermove="selected = rowIndices.get(entry.id)!" @focusin="selected = rowIndices.get(entry.id)!">
                        <a :href="entry.id" class="search-result vp-raw"
                          @click="onResultClick($event, entry.id)">
                          <svg class="search-history-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path d="M3 11a9 9 0 1 1 2.7 7M3 5v6h6M12 7v5l3 2" />
                          </svg>
                          <div class="search-row-content">
                            <div class="search-row-title">{{ entry.title }}</div>
                            <p v-if="entry.pageTitle !== entry.title" class="search-history-page">{{ entry.pageTitle }}</p>
                          </div>
                        </a>
                        <button type="button" class="search-history-star" :aria-label="`Favorite ${entry.title}`"
                          :aria-pressed="favoriteIds.has(entry.id)" :data-favorite-id="entry.id"
                          :title="favoriteIds.has(entry.id) ? 'Remove from favorites' : 'Add to favorites'"
                          @click="toggleFavorite(entry)">
                          <svg viewBox="0 0 24 24" :fill="favoriteIds.has(entry.id) ? 'currentColor' : 'none'"
                            stroke="currentColor" aria-hidden="true">
                            <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
                          </svg>
                        </button>
                        <button v-if="group.kind === 'recent'" type="button" class="search-history-remove" :aria-label="`Remove ${entry.title} from recent searches`"
                          @click="removeRecent(entry.id)">×</button>
                        <span v-else class="search-history-action-space" aria-hidden="true" />
                      </div>
                    </li>
                    </ul>
                  </section>
                </div>
              </template>
              <div v-else-if="loading" class="search-empty">Loading search…</div>
              <div v-else-if="failed" class="search-empty">
                <p>Search could not load. Please reload the page.</p><button type="button" @click="reload">Reload page</button>
              </div>
              <template v-else>
                <p v-if="response.mode === 'typo'" class="search-notice">No exact match. Showing close spelling matches.</p>
                <p v-else-if="response.mode === 'related'" class="search-notice">
                  No result matches every word. Related results<span v-if="response.unmatched.length"> (without “{{ response.unmatched.join(' ') }}”)</span>:
                </p>
                <div v-if="!rows.length" class="search-empty">No results for “{{ query }}”</div>
                <ul v-else id="documentation-search-results" role="listbox" aria-label="Search results" class="search-groups">
                  <li v-for="group in response.groups" :key="group.page" role="group" :aria-label="group.title" class="search-group">
                    <h3 class="search-group-title">
                      <template v-for="(chunk, i) in highlight(group.title, group.results.flatMap(row => row.matchTerms))" :key="i">
                        <mark v-if="chunk.marked">{{ chunk.text }}</mark><span v-else>{{ chunk.text }}</span>
                      </template>
                    </h3>
                    <ul role="presentation">
                      <li v-for="row in group.results" :key="row.id" :id="`search-result-${rowIndices.get(row.id)}`"
                        role="option" :aria-selected="selected === rowIndices.get(row.id)">
                        <a :href="row.id" class="search-result vp-raw" :class="{ selected: selected === rowIndices.get(row.id) }"
                          @pointermove="selected = rowIndices.get(row.id)!" @focus="selected = rowIndices.get(row.id)!"
                          @click="onResultClick($event, row.id)">
                          <span class="search-row-icon" aria-hidden="true">{{ row.titles.length ? '#' : '↗' }}</span>
                          <div class="search-row-content">
                            <span v-if="row.titles.length > 1" class="search-ancestry">{{ row.titles.slice(1).join(' › ') }}</span>
                            <div class="search-row-title">
                              <template v-for="(chunk, i) in highlight(row.title, row.matchTerms)" :key="i">
                                <mark v-if="chunk.marked">{{ chunk.text }}</mark><span v-else>{{ chunk.text }}</span>
                              </template>
                            </div>
                            <p v-if="row.text" class="search-snippet">
                              <template v-for="(chunk, i) in highlight(excerpt(row), row.matchTerms)" :key="i">
                                <mark v-if="chunk.marked">{{ chunk.text }}</mark><span v-else>{{ chunk.text }}</span>
                              </template>
                            </p>
                          </div>
                          <span class="search-enter" aria-hidden="true">↵</span>
                        </a>
                      </li>
                    </ul>
                  </li>
                </ul>
              </template>
            </div>
          </div>
          <footer class="search-footer"><span>{{ countLabel }}</span>
            <span class="search-shortcuts"><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> select <kbd>Esc</kbd> close</span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
