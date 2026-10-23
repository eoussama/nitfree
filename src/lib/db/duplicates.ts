import type { TDuplicateGroup, TItemRow } from "./types";

import { fingerprintBands, isSimilar } from "~/lib/media/fingerprint";



type TCandidate = Pick<TItemRow, "id" | "hash" | "fingerprint" | "width" | "height" | "usageCount" | "createdAt">;

/**
 * Aspect ratios further apart than this, relatively, are different pictures, such as a crop.
 */
const MAX_RATIO_DIFFERENCE = 0.05;

type TPicture = Pick<TItemRow, "width" | "height"> & { fingerprint: string };

function sameShape(a: Pick<TItemRow, "width" | "height">, b: Pick<TItemRow, "width" | "height">): boolean {
  const ratio = (a.width / a.height) / (b.width / b.height);

  return Math.abs(ratio - 1) <= MAX_RATIO_DIFFERENCE;
}

/**
 * Whether two images show the same picture, maybe resized or saved in another format: the same shape,
 * and fingerprints close together.
 *
 * @param a - An image's size and fingerprint.
 * @param b - Another's.
 * @returns Whether they match.
 */
export function areSimilar(a: TPicture, b: TPicture): boolean {
  return sameShape(a, b) && isSimilar(a.fingerprint, b.fingerprint);
}

/**
 * Finds the item that shows the same picture as an image, among items with fingerprints; only those
 * sharing a part of its fingerprint are compared.
 *
 * @param picture - The image's size and fingerprint.
 * @param items - The items.
 * @returns The one that would be kept of the matches, or null when none matches.
 */
export function findSimilar<T extends TCandidate>(picture: TPicture, items: readonly T[]): T | null {
  const bands = new Set(fingerprintBands(picture.fingerprint));
  const matches = items.filter(item => item.fingerprint && fingerprintBands(item.fingerprint).some(band => bands.has(band)) && areSimilar(picture, { ...item, fingerprint: item.fingerprint }));

  return matches.sort(preference)[0] ?? null;
}

// Larger first, then the most sent, then the oldest: the order in which items are suggested to keep.
function preference(a: TCandidate, b: TCandidate): number {
  return b.width * b.height - a.width * a.height || b.usageCount - a.usageCount || a.createdAt - b.createdAt;
}

/**
 * Groups items that show the same picture: files that are the same, and files whose fingerprints are
 * close, such as a resized copy or the same image saved in another format. Matches chain, so if A
 * matches B and B matches C, the three are one group.
 *
 * @param items - The items.
 * @returns The groups of two or more items, the one to keep first, largest groups first.
 */
export function groupDuplicates(items: readonly TCandidate[]): TDuplicateGroup[] {
  const parent = items.map((_, i) => i);

  function root(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }

    return i;
  }

  function join(a: number, b: number): void {
    parent[root(a)] = root(b);
  }

  // Only items sharing a file or a part of a fingerprint are compared, so large libraries stay quick.
  const buckets = new Map<string, number[]>();

  items.forEach((item, i) => {
    const keys = [`hash:${item.hash}`, ...(item.fingerprint ? fingerprintBands(item.fingerprint) : [])];

    for (const key of keys) {
      const bucket = buckets.get(key);

      if (bucket) {
        bucket.push(i);
      }
      else {
        buckets.set(key, [i]);
      }
    }
  });

  for (const [key, bucket] of buckets) {
    const exact = key.startsWith("hash:");

    for (let a = 0; a < bucket.length; a++) {
      for (let b = a + 1; b < bucket.length; b++) {
        const first = items[bucket[a]!]!;
        const second = items[bucket[b]!]!;

        if (root(bucket[a]!) === root(bucket[b]!)) {
          continue;
        }

        if (exact || areSimilar({ ...first, fingerprint: first.fingerprint! }, { ...second, fingerprint: second.fingerprint! })) {
          join(bucket[a]!, bucket[b]!);
        }
      }
    }
  }

  const groups = new Map<number, TCandidate[]>();

  items.forEach((item, i) => {
    const group = groups.get(root(i));

    if (group) {
      group.push(item);
    }
    else {
      groups.set(root(i), [item]);
    }
  });

  return [...groups.values()]
    .filter(group => group.length > 1)
    .map(group => group.sort(preference))
    .sort((a, b) => b.length - a.length || preference(a[0]!, b[0]!))
    .map(group => ({ ids: group.map(item => item.id), exact: group.every(item => item.hash === group[0]!.hash) }));
}
