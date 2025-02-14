import { CONFIG, LogHelper, StringHelper, TagHelper } from "~/core";



if (import.meta.hot) {
  // @ts-expect-error for background HMR
  import("/@vite/client");
  import("./contentScriptHMR");
}

browser.runtime.onInstalled.addListener(async (): Promise<void> => {
  const name = StringHelper.capitalize(CONFIG.name);

  LogHelper.print(`${name} was installed successfully!`);

  try {
    await TagHelper.seed();
  } catch(err) {
    LogHelper.error((err as unknown as Error).message);
  }
});
