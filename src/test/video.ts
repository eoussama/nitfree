/**
 * A video element that loads and seeks when told to: a length of null is one that does not say how
 * long it is until it is seeked past its end, as videos recorded in a browser do.
 */
export class FakeVideo extends EventTarget {
  readyState = 4;
  seeking = false;
  muted = false;
  preload = "";
  videoWidth = 640;
  videoHeight = 360;
  error: { message: string } | null = null;
  // What the browser says when the video cannot be played; empty or null for nothing.
  failure: string | null = "Unsupported.";
  duration = Number.NaN;
  seeks: number[] = [];
  // What the picture is made of, for drawing it to a canvas.
  solid = [255, 0, 0, 255];
  private time = 0;

  /**
   * Makes a video that has not loaded yet.
   *
   * @param length - How long it is, in seconds, or null for one that does not say until seeked past its end.
   * @param loads - Whether it loads, or fails to.
   */
  constructor(private readonly length: number | null, private readonly loads = true) {
    super();
  }

  /**
   * Where the video is, in seconds.
   *
   * @returns The time.
   */
  get currentTime(): number {
    return this.time;
  }

  /**
   * Seeks, answering with "seeked" a moment later, as a browser does.
   *
   * @param value - Where to, in seconds.
   */
  set currentTime(value: number) {
    this.seeks.push(value);
    this.time = Math.min(value, this.length ?? Math.min(value, 12));
    queueMicrotask(() => {
      if (this.length === null && value > 1e6) {
        this.duration = 12;
      }

      this.dispatchEvent(new Event("seeked"));
    });
  }

  private url = "";

  /**
   * The address the video was told to load.
   *
   * @returns The address.
   */
  get src(): string {
    return this.url;
  }

  /**
   * Starts loading, answering with "loadeddata" or "error" a moment later.
   *
   * @param url - The address.
   */
  set src(url: string) {
    this.url = url;
    queueMicrotask(() => {
      if (!this.loads) {
        this.error = this.failure === null ? null : { message: this.failure };
        this.dispatchEvent(new Event("error"));

        return;
      }

      this.duration = this.length ?? Number.NaN;
      this.dispatchEvent(new Event("loadeddata"));
    });
  }
}

/**
 * The fake, as the element the code under test takes.
 *
 * @param video - The fake video.
 * @returns The same object, typed as a video element.
 */
export const asVideo = (video: FakeVideo) => video as unknown as HTMLVideoElement;
