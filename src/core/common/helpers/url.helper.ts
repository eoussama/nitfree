export class URLHelper {

  static watch(callback: () => void): () => void {
    let cachedUrl = window.location.href;

    const observer = new MutationObserver(() => {
      if (window.location.href !== cachedUrl) {
        cachedUrl = window.location.href;
        callback();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }
}
