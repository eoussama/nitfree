import { Database, LogHelper } from "~/core";



if (import.meta.hot) {
  // @ts-expect-error for background HMR
  import("/@vite/client");
  import("./contentScriptHMR");
}

browser.runtime.onInstalled.addListener(async (): Promise<void> => {
  LogHelper.print("Nitfree was installed successfully!");

  try {
    await Database.getInstance(); 
  } catch(err) {
    LogHelper.error((err as unknown as Error).message);
  }
});
