import { TUnsafe, TPrimitive } from "../types";



export class LogHelper {
  
  static print(...args: Array<TUnsafe<TPrimitive>>) {
    console.info("[Nitfree]", ...args);
  }

  static error(...args: Array<TUnsafe<TPrimitive>>) {
    console.error("[Nitfree]", ...args);
  }
}
