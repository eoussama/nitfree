import { CONFIG, Database, LogHelper, StringHelper } from "~/core";



if (import.meta.hot) {
  // @ts-expect-error for background HMR
  import("/@vite/client");
  import("./contentScriptHMR");
}

browser.runtime.onInstalled.addListener(async (): Promise<void> => {
  const name = StringHelper.capitalize(CONFIG.name);

  LogHelper.print(`${name} was installed successfully!`);

  try {
    const db = await Database.getInstance();

    db.TAGS.create({
      name: "tag" + Math.random() * 1000,
      description: "my desc?"
    });

  } catch(err) {
    LogHelper.error((err as unknown as Error).message);
  }
});
