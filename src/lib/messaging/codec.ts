import { isObject } from "@eoussama/core";



/**
 * Chrome serializes extension messages as JSON, so binary values and dates
 * do not survive the trip. They are swapped for tagged objects before sending
 * and restored on the other side, which keeps every browser on the same path.
 */
const TAG = "$nf";

type TEncodedBlob = { [TAG]: "blob"; type: string; data: string };
type TEncodedFile = { [TAG]: "file"; type: string; name: string; lastModified: number; data: string };
type TEncodedBuffer = { [TAG]: "buffer"; data: string };
type TEncodedBytes = { [TAG]: "bytes"; data: string };
type TEncodedDate = { [TAG]: "date"; value: number };

type TEncodedValue = TEncodedBlob | TEncodedFile | TEncodedBuffer | TEncodedBytes | TEncodedDate;

const CHUNK_SIZE = 0x8000;



/**
 * Encodes bytes as base64, in chunks so large files do not overflow the stack.
 *
 * @param bytes - The bytes to encode.
 * @returns The base64 string.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }

  return btoa(binary);
}

/**
 * Decodes a base64 string produced by {@link toBase64}.
 *
 * @param data - The base64 string.
 * @returns The decoded bytes.
 */
export function fromBase64(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function isEncoded(value: Record<string, unknown>): value is TEncodedValue {
  return typeof value[TAG] === "string";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;

  return prototype === Object.prototype || prototype === null;
}

/**
 * Makes a value safe to send as an extension message.
 *
 * @param value - Any value, possibly holding blobs, files, buffers or dates.
 * @returns A JSON-safe copy of the value.
 */
export async function encode(value: unknown): Promise<unknown> {
  if (value instanceof File) {
    const data = toBase64(new Uint8Array(await value.arrayBuffer()));

    return { [TAG]: "file", type: value.type, name: value.name, lastModified: value.lastModified, data } satisfies TEncodedFile;
  }

  if (value instanceof Blob) {
    const data = toBase64(new Uint8Array(await value.arrayBuffer()));

    return { [TAG]: "blob", type: value.type, data } satisfies TEncodedBlob;
  }

  if (value instanceof ArrayBuffer) {
    return { [TAG]: "buffer", data: toBase64(new Uint8Array(value)) } satisfies TEncodedBuffer;
  }

  if (value instanceof Uint8Array) {
    return { [TAG]: "bytes", data: toBase64(value) } satisfies TEncodedBytes;
  }

  if (value instanceof Date) {
    return { [TAG]: "date", value: value.getTime() } satisfies TEncodedDate;
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map(encode));
  }

  if (isPlainObject(value)) {
    const entries = await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await encode(entry)] as const));

    return Object.fromEntries(entries);
  }

  return value;
}

/**
 * Restores a value produced by {@link encode}.
 *
 * @param value - The received message payload.
 * @returns The value with blobs, files, buffers and dates restored.
 */
export function decode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decode);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  if (isEncoded(value)) {
    switch (value[TAG]) {
      case "file":
        return new File([fromBase64(value.data)], value.name, { type: value.type, lastModified: value.lastModified });

      case "blob":
        return new Blob([fromBase64(value.data)], { type: value.type });

      case "buffer":
        return fromBase64(value.data).buffer;

      case "bytes":
        return fromBase64(value.data);

      case "date":
        return new Date(value.value);
    }
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry)]));
}
