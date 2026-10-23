/**
 * What a GIF's frames say about themselves, read block by block: whether each has a transparent
 * color and which, how it is disposed of, and whether the file ends as a GIF must.
 *
 * @param bytes - The GIF.
 * @returns Each frame's control block, in order, and whether the trailer is there.
 */
export function readControls(bytes: Uint8Array): { frames: { transparent: boolean; index: number; dispose: number }[]; trailer: boolean } {
  const frames: { transparent: boolean; index: number; dispose: number }[] = [];
  const skip = (from: number): number => {
    let at = from;

    while (bytes[at] !== 0) {
      at += bytes[at]! + 1;
    }

    return at + 1;
  };
  const table = (packed: number): number => (packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0);
  let at = 13 + table(bytes[10]!);

  while (at < bytes.length && bytes[at] !== 0x3B) {
    if (bytes[at] === 0x21) {
      if (bytes[at + 1] === 0xF9) {
        const packed = bytes[at + 3]!;

        frames.push({ transparent: (packed & 1) === 1, index: bytes[at + 6]!, dispose: (packed >> 2) & 7 });
      }

      at = skip(at + 2);
    }
    else {
      at = skip(at + 11 + table(bytes[at + 9]!));
    }
  }

  return { frames, trailer: bytes.at(-1) === 0x3B };
}
