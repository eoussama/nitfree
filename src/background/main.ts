import { CONFIG, Database, LogHelper, StringHelper, Tags } from "~/core";



if (import.meta.hot) {
  // @ts-expect-error for background HMR
  import("/@vite/client");
  import("./contentScriptHMR");
}

browser.runtime.onInstalled.addListener(async (): Promise<void> => {
  const name = StringHelper.capitalize(CONFIG.name);

  LogHelper.print(`${name} was installed successfully!`);

  try {
    await Database.init();

    const tags = Tags.getInstance();
    tags.create();

  } catch(err) {
    LogHelper.error((err as unknown as Error).message);
  }
});
