import { TNullable, TPrimitive } from "./../types";



export class EnumHelper {
  static toString<T extends Record<string, TPrimitive>>(enumerator: T, value: T[keyof T]): TNullable<string> {
    const keys = Object.keys(enumerator).filter(key => isNaN(parseInt(key)));
    const match = keys.find(key => enumerator[key] === value);

    return match?.toString()?.toLowerCase() ?? null;
  }
}
