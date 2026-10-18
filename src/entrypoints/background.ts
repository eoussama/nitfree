import { handleMessages } from "~/lib/messaging";



export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") {
      void browser.storage.local.set({ installedOn: Date.now() });
    }
  });

  handleMessages({
    "runtime:ping": () => ({ version: browser.runtime.getManifest().version }),
  });
});
