import { createApp } from "vue";
import { setupApp } from "./setup.bootstrap";



function createContainer(id: string): [HTMLDivElement, HTMLDivElement] {
  const root = document.createElement("div");
  const styleEl = document.createElement("link");
  const container = document.createElement("div");
  const shadowDOM = container.attachShadow?.({ mode: __DEV__ ? "open" : "closed" }) || container;

  container.id = id;
  styleEl.setAttribute("rel", "stylesheet");
  styleEl.setAttribute("href", browser.runtime.getURL("dist/contentScripts/style.css"));

  shadowDOM.appendChild(styleEl);
  shadowDOM.appendChild(root);

  return [container, root];
}

export function inject(view: Element, selector: string, id: string): void {
  const [container, root] = createContainer(id);

  setTimeout(() => { // TODO: wait for render
    const target = document.querySelector(selector);

    if (target) {
      target.appendChild(container);
    }

    const app = createApp(view);

    setupApp(app);
    app.mount(root);
  }, 3500);
}
