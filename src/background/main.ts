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

    const tagId = await db.TAGS.create({
      name: "tag" + Math.random() * 1000,
      description: "my description here !1!!"
    });

    const fileId = await db.FILES.create({
      data: new Blob(["pass=123"], { type: "text/plain" })
    });

    const dataId = await db.METADATA.create({
      description: "this is a text file",
      fileId,
      favorite: true,
      title: "Secret Sauce",
      tagId
    });

    LogHelper.print("created object with id =", dataId);

    const data = await db.FILES.get(fileId);

    LogHelper.print("the created file", data.id, "is", data.data.size, "bytes");

  } catch(err) {
    LogHelper.error((err as unknown as Error).message);
  }
});
