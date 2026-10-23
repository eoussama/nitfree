import { describe, expect, it } from "vitest";

import { decode, encode, fromBase64, toBase64 } from "./codec";



async function roundTrip<T>(value: T): Promise<T> {
  return decode(JSON.parse(JSON.stringify(await encode(value)))) as T;
}

describe("codec", () => {
  it("round trips base64 for large buffers", () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);

    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("leaves plain JSON untouched", async () => {
    const value = { a: 1, b: "two", c: [true, null], d: { e: 1.5 } };

    expect(await encode(value)).toEqual(value);
    expect(await roundTrip(value)).toEqual(value);
  });

  it("restores blobs with their type and content", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const restored = await roundTrip(blob);

    expect(restored).toBeInstanceOf(Blob);
    expect(restored.type).toBe("image/png");
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("restores files with their name and timestamp", async () => {
    const file = new File(["hello"], "cat.gif", { type: "image/gif", lastModified: 1_700_000_000_000 });
    const restored = await roundTrip(file);

    expect(restored).toBeInstanceOf(File);
    expect(restored.name).toBe("cat.gif");
    expect(restored.type).toBe("image/gif");
    expect(restored.lastModified).toBe(1_700_000_000_000);
    expect(await restored.text()).toBe("hello");
  });

  it("restores buffers, byte arrays and dates nested in objects", async () => {
    const value = {
      buffer: new Uint8Array([9, 8]).buffer,
      bytes: new Uint8Array([7, 6]),
      items: [{ createdAt: new Date(1_000) }],
    };
    const restored = await roundTrip(value);

    expect(restored.buffer).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(restored.buffer)).toEqual(new Uint8Array([9, 8]));
    expect(restored.bytes).toEqual(new Uint8Array([7, 6]));
    expect(restored.items[0]?.createdAt).toEqual(new Date(1_000));
  });
});

describe("encode of objects with no prototype", () => {
  it("treats them as plain objects", async () => {
    const bare = Object.create(null) as Record<string, unknown>;

    bare.name = "bare";
    expect(await decode(await encode(bare))).toEqual({ name: "bare" });
  });
});
