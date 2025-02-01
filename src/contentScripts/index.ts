/* eslint-disable no-console */
import { onMessage } from 'webext-bridge/content-script'
import { createApp } from 'vue'
import App from './views/App.vue'
import { setupApp } from '~/logic/common-setup'

// Firefox `browser.tabs.executeScript()` requires scripts return a primitive value
(() => {
  if (document.getElementById(__NAME__)) {
    console.info('[Nitfree] Container already exists, skipping injection.')
    return
  }

  console.info('[Nitfree] Hello world from content script!')

  // communication example: send previous tab title from background page
  onMessage('tab-prev', ({ data }) => {
    console.log(`[Nitfree] Navigate from page "${data.title}"`)
  })

  // mount component to context window
  const container = document.createElement('div')
  container.id = __NAME__

  const root = document.createElement('div')
  const styleEl = document.createElement('link')
  const shadowDOM = container.attachShadow?.({ mode: __DEV__ ? 'open' : 'closed' }) || container

  styleEl.setAttribute('rel', 'stylesheet')
  styleEl.setAttribute('href', browser.runtime.getURL('dist/contentScripts/style.css'))

  shadowDOM.appendChild(styleEl)
  shadowDOM.appendChild(root)

  setTimeout(() => {
    console.info('[Nitfree] Inject now')
    const buttons = document.querySelector('[class^="channelBottomBarArea_"] [class^="channelTextArea_"] [class^="buttons_"]')
    if (buttons) {
      buttons.appendChild(container)
    }

    const app = createApp(App)
    setupApp(app)
    app.mount(root)
  }, 3500)
})()
