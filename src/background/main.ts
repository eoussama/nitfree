import { Database, LogHelper } from "~/core";



// only on dev mode
if (import.meta.hot) {
  // @ts-expect-error for background HMR
  import("/@vite/client");
  // load latest content script
  import("./contentScriptHMR");
}

browser.runtime.onInstalled.addListener(async (): Promise<void> => {
  LogHelper.print("Nitfree was installed successfully!");

  try {
    const db = new Database();
    await db.db;
  } catch(err) {
    LogHelper.print((err as unknown as Error).message);
  }
});
