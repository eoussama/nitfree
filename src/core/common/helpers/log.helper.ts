import { CONFIG } from "../consts";
import { TUnsafe, TPrimitive } from "../types";



export class LogHelper {
  
  public static print(...args: Array<TUnsafe<TPrimitive>>) {
    console.info(...this.format(...args));
  }

  public static error(...args: Array<TUnsafe<TPrimitive>>) {
    console.error(...this.format(...args));
  }

  private static format(...args: Array<TUnsafe<TPrimitive>>): Array<TUnsafe<TPrimitive>> {
    const name = CONFIG.name.toUpperCase();
    const prefix = `[${name}]`;

    return [prefix, ...args];
  }
}
