import { fileURLToPath } from 'node:url'

export function documentSearchPlugin() {
  const modal = fileURLToPath(new URL('./theme/DocumentationSearch.vue', import.meta.url))
    .replaceAll('\\', '/')

  return {
    name: 'axolotl-document-search',
    enforce: 'pre',
    transform(source, id) {
      const path = id.replaceAll('\\', '/')
      if (path.endsWith('/VPNavBar.vue')) {
        const controls = /<VPNavBarSearch class="search" \/>\s*<VPNavBarMenu class="menu" \/>/
        if (!controls.test(source)) {
          throw new Error('VitePress navigation changed; review the search position.')
        }
        return {
          code: source.replace(controls,
            '<VPNavBarMenu class="menu" />\n            <VPNavBarSearch class="search" />'),
          map: null
        }
      }
      if (!path.endsWith('/VPNavBarSearch.vue')) return
      const componentImport = "import('./VPLocalSearchBox.vue')"
      if (!source.includes(componentImport)) {
        throw new Error('VitePress local search changed; review the document search integration.')
      }
      return {
        code: source.replace(componentImport, `import(${JSON.stringify(modal)})`),
        map: null
      }
    }
  }
}
