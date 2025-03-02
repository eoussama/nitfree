import { EDOMWatch } from "../enums";



export class DOMHelper {

  static watch(selector: string, callback: (action: EDOMWatch) => void): () => void {
    const observer = new MutationObserver((mutations) => {
      if (document.body.querySelector(selector)) {
        callback(EDOMWatch.Added);
        return;
      }

      for (const node of mutations.flatMap((m) => m.removedNodes)) {
        const element = node.item(0) as Element;

        const isMatchingNode = element?.matches(selector);
        const isParentNode = element?.querySelector(selector);
        const isValidNode = element?.nodeType === element?.ELEMENT_NODE;

        if (isValidNode && (isMatchingNode || isParentNode)) {
          callback(EDOMWatch.Removed);
          return;
        }
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => {
      observer.disconnect();
    };
  }
}
