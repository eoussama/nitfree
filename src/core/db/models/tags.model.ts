import { ETable } from "../enums";
import { Table } from "./table.model";
import { ITable, ITag } from "../interfaces";
import { TStrip } from "../types";
import { BaseHelper } from "../helpers";



export class Tags extends Table implements ITable<ITag> {
  public constructor(db: IDBDatabase) {
    super(db, ETable.Tags);
  }

  protected override onInit(table: IDBObjectStore): void {
    table.createIndex("nameIdx", "name", { unique: false });
  }

  create(tag: TStrip<ITag>): Promise<string> {
    return new Promise((resolve, reject) => {
      const value = BaseHelper.create(tag);
      const request = this.table.add(value);

      request.onsuccess = () => {
        resolve(value.id);
      };

      request.onerror = () => {
        reject(new Error("Could not insert tag"));
      };
    });
  }
}
