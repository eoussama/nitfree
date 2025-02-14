import { TStrip } from "../types";
import { IBase } from "../interfaces";



export class BaseHelper {

  public static create<T extends IBase>(obj: TStrip<T>): T {
    const now = new Date();

    const createdOn = now;
    const updatedOn = now;
    const id = crypto.randomUUID();
    
    const base = { id, createdOn, updatedOn };
    const value = <T>{ ...obj, ...base };
    
    return value;
  }

  public static update<T extends IBase>(oldValue: T, obj: Partial<TStrip<T>>): T {
    const newValue = {
      ...oldValue, ...obj,
      updatedOn: new Date()
    };

    return newValue;
  }
}
