import { createApp } from "vue";
import { setupApp } from "./setup.bootstrap";

import { TUnsafe, URLHelper } from "../common";



function createContainer(id: string): [HTMLDivElement, HTMLDivElement] {
  const root = document.createElement("div");
  const styleEl = document.createElement("link");
  const container = document.createElement("div");
  const shadowDOM = container.attachShadow?.({ mode: __DEV__ ? "open" : "closed" }) || container;

  container.id = id;
  container.style.visibility = "hidden";

  styleEl.setAttribute("rel", "stylesheet");
  styleEl.setAttribute("href", browser.runtime.getURL("dist/contentScripts/style.css"));

  shadowDOM.appendChild(styleEl);
  shadowDOM.appendChild(root);

  return [container, root];
}

function mountApp(view: object, selector: string, id: string): void {
  const target = document.querySelector(selector);
  if (!target) {
    return;
  }

  const [container, root] = createContainer(id);
  const app = createApp(view);

  setupApp(app);
  app.mount(root);
  target.appendChild(container);

  URLHelper.watch(() => { 
    app.unmount();
    container.remove(); 
  });

  requestAnimationFrame(() => {
    setTimeout(() => {
      container.style.visibility = "visible";
    }, 200);
  });
}

export function inject(view: object, selector: string, id: string): TUnsafe<() => void> {
  if (document.getElementById(id)) {
    return;
  }

  const observer = new MutationObserver(() => {
    const element = document.querySelector(selector);

    if (element) {
      inject(view, selector, id);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  mountApp(view, selector, id);

  return () => {
    observer.disconnect();
  };
}
