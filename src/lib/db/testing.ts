import { NitfreeDatabase } from "./schema";



let count = 0;

/**
 * A fresh, isolated library database for one test.
 *
 * @returns The database, opened.
 */
export async function openTestDatabase(): Promise<NitfreeDatabase> {
  const db = new NitfreeDatabase(`nitfree-test-${++count}`);

  await db.open();

  return db;
}

/**
 * A clock that moves forward one millisecond per call, so timestamps are predictable.
 *
 * @param start - The first timestamp.
 * @returns The clock.
 */
export function steppingClock(start = 1_000): () => number {
  let current = start;

  return () => current++;
}
