import { TUnsafe, TPrimitive } from "../types";



export class LogHelper {
  static print(...args: Array<TUnsafe<TPrimitive>>) {
    console.info("[Nitfree]", ...args);
  }
}
