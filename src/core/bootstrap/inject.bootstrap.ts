import { createApp } from "vue";
import { setupApp } from "./setup.bootstrap";



export function inject(view: Element, selector: string, id: string): void {
  const root = document.createElement("div");
  const styleEl = document.createElement("link");
  const container = document.createElement("div");
  const shadowDOM = container.attachShadow?.({ mode: __DEV__ ? "open" : "closed" }) || container;

  container.id = id;
  styleEl.setAttribute("rel", "stylesheet");
  styleEl.setAttribute("href", browser.runtime.getURL("dist/contentScripts/style.css"));

  shadowDOM.appendChild(styleEl);
  shadowDOM.appendChild(root);

  // TODO: wait for render
  setTimeout(() => {

  const target = document.querySelector(selector);
  if (target) {
    target.appendChild(container);
  }

  const app = createApp(view);

  setupApp(app);
  app.mount(root);
  }, 3500);
}
