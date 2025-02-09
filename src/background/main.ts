import { Database, LogHelper } from "~/core";



if (import.meta.hot) {
  // @ts-expect-error for background HMR
  import("/@vite/client");
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
