// The parts of gifenc (https://github.com/mattdesl/gifenc) Nitfree uses; the package ships no types.
declare module "gifenc" {
  export type TPalette = number[][];
  export type TFormat = "rgb565" | "rgb444" | "rgba4444";

  export type TFrameOptions = {
    palette?: TPalette;
    delay?: number;
    transparent?: boolean;
    transparentIndex?: number;
    repeat?: number;
    dispose?: number;
  };

  export type TEncoderOptions = { auto?: boolean; initialCapacity?: number };

  export type TQuantizeOptions = { format?: TFormat; oneBitAlpha?: boolean | number; clearAlpha?: boolean };

  export type TEncoder = {
    writeFrame: (index: Uint8Array, width: number, height: number, options?: TFrameOptions) => void;
    finish: () => void;
    bytes: () => Uint8Array<ArrayBuffer>;
  };

  /**
   * Starts a GIF; the first frame written sets its size and global palette.
   *
   * @param options - How the encoder works; the defaults suit whole files.
   * @returns The encoder.
   */
  export function GIFEncoder(options?: TEncoderOptions): TEncoder;

  /**
   * Picks a palette for RGBA pixels.
   *
   * @param rgba - The pixels.
   * @param maxColors - At most this many colors.
   * @param options - Pixel format and alpha handling.
   * @returns The palette.
   */
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: TQuantizeOptions): TPalette;

  /**
   * Maps RGBA pixels to their nearest palette entries.
   *
   * @param rgba - The pixels.
   * @param palette - The palette.
   * @param format - The pixel format the palette was made with.
   * @returns One palette index per pixel.
   */
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: TPalette, format?: TFormat): Uint8Array;
}
