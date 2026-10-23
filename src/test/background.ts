import { fakeBrowser } from "wxt/testing/fake-browser";

import { createLibrary, createLibraryHandlers, createPacks, createTags } from "~/lib/db";
import { openTestDatabase, steppingClock } from "~/lib/db/testing";

import { broadcast, handleMessages } from "~/lib/messaging";



/**
 * Starts the background as the extension does, on an empty library: the real handlers on a test
 * database, reached through the fake browser's messaging, with changes announced as they are.
 *
 * @returns The library services, to put things in it and read it back.
 */
export async function startBackground() {
  fakeBrowser.reset();

  const db = await openTestDatabase();
  const clock = steppingClock();
  const library = createLibrary(db, clock, async () => null);
  const tags = createTags(db, clock);
  const packs = createPacks(db, clock);

  handleMessages(createLibraryHandlers(library, tags, packs, broadcast));

  return { db, library, tags, packs };
}
