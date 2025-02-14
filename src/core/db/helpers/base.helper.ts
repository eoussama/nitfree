import { IBase } from "../interfaces";
import { TStrip } from "../types";



export class BaseHelper {

  public static create<T extends IBase>(obj: TStrip<T>): T {
    const createdOn = new Date();
    const updatedOn = new Date();
    const id = crypto.randomUUID();
    
    const base = { id, createdOn, updatedOn };
    const value = <T>{ ...obj, ...base };
    
    return value;
  }
}
