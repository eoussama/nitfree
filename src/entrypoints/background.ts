import { createLibrary, createLibraryHandlers, createPacks, createTags, migrateLegacyDatabase, NitfreeDatabase } from "~/lib/db";
import { broadcast, handleMessages } from "~/lib/messaging";



export default defineBackground(() => {
  const db = new NitfreeDatabase();

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") {
      void browser.storage.local.set({ installedOn: Date.now() });
    }
  });

  handleMessages({
    "runtime:ping": () => ({ version: browser.runtime.getManifest().version }),
    ...createLibraryHandlers(createLibrary(db), createTags(db), createPacks(db), broadcast),
  });

  // Pages that loaded the library while the migration ran refresh on these announcements.
  migrateLegacyDatabase(db)
    .then(async (result) => {
      if (result?.tags.length) {
        await broadcast("tags:changed", { change: "added", ids: result.tags });
      }

      if (result?.items.length) {
        await broadcast("library:changed", { change: "added", ids: result.items });
      }
    })
    .catch((error: unknown) => {
      console.error("Moving the previous version's library failed; it will be retried on the next start.", error);
    });
});
