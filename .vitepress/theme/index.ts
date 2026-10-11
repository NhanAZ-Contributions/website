// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { enhanceAppWithTabs } from 'vitepress-plugin-tabs/client'
import "@catppuccin/vitepress/theme/mocha/blue.css"
import './content.css'
import './footer.css'
import './search.css'
import { footerMessage } from '../footer'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
      'doc-after': () => h('p', { class: 'doc-disclaimer' }, footerMessage)
    })
  },
  enhanceApp({ app }) {
    enhanceAppWithTabs(app)
  }
} satisfies Theme
