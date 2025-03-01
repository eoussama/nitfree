import { createApp } from "vue";
import { setupApp } from "./setup.bootstrap";



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

  requestAnimationFrame(() => {
    setTimeout(() => {
      container.style.visibility = "visible";
    }, 100);
  });
}

export function inject(view: object, selector: string, id: string): void {
  if (document.getElementById(id)) {
    return;
  }

  const observer = new MutationObserver((_, observe) => {
    const element = document.querySelector(selector);

    if (element) {
      inject(view, selector, id);
      observe.disconnect();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  mountApp(view, selector, id);
}
