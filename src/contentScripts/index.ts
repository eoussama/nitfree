import { createApp } from "vue";

import App from "./views/App.vue";
import { setupApp } from "~/core";



(() => {
  if (document.getElementById(__NAME__)) {
    return;
  }

  const root = document.createElement("div");
  const styleEl = document.createElement("link");
  const container = document.createElement("div");
  const shadowDOM = container.attachShadow?.({ mode: __DEV__ ? "open" : "closed" }) || container;

  container.id = __NAME__;
  styleEl.setAttribute("rel", "stylesheet");
  styleEl.setAttribute("href", browser.runtime.getURL("dist/contentScripts/style.css"));

  shadowDOM.appendChild(styleEl);
  shadowDOM.appendChild(root);
  
  setTimeout(() => {
    const buttons = document.querySelector("[class^=\"channelBottomBarArea_\"] [class^=\"channelTextArea_\"] [class^=\"buttons_\"]");
    if (buttons) {
      buttons.appendChild(container);
    }

    const app = createApp(App);

    setupApp(app);
    app.mount(root);
  }, 3500);
})();
