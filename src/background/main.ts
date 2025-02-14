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

    const tag = await db.TAGS.create({
      name: "tag" + Math.random() * 1000,
      description: "my description here !1!!"
    });

    const file = await db.FILES.create({
      data: new Blob(["pass=123"], { type: "text/plain" })
    });

    const data = await db.METADATA.create({
      description: "this is a text file *",
      fileId: file.id,
      favorite: true,
      title: "Secret Sauce",
      tagId: tag.id
    });

    LogHelper.print("created object with id =", data.id);

    const fetchedData = await db.FILES.get(file.id);

    LogHelper.print("the created file", file.id, "is", fetchedData.data.size, "bytes");

    const updatedFile = await db.FILES.update(file.id, {
      data: new Blob(["password=dea//7frez_feEE/7"], { type: "text/plain" })
    });

    LogHelper.print("the updated file", updatedFile.id, "is", updatedFile.data.size, "bytes");
  } catch(err) {
    LogHelper.error((err as unknown as Error).message);
  }
});
