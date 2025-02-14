import { ETable } from "../enums";
import { Table } from "./table.model";
import { ITable, ITag } from "../interfaces";
import { TStrip } from "../types";



export class Tags extends Table implements ITable<ITag> {
  public constructor(db: IDBDatabase) {
    super(db, ETable.Tags);
  }

  protected override onInit(table: IDBObjectStore): void {
    table.createIndex("nameIdx", "name", { unique: false });
  }

  create(tag: TStrip<ITag>): Promise<string> {
    return new Promise((resolve, reject) => {
      const createdOn = new Date();
      const updatedOn = new Date();
      const id = crypto.randomUUID();

      const value: ITag = {
        id, createdOn, updatedOn,
        ...tag
      };

      const request = this.table.add(value);

      request.onsuccess = () => {
        resolve(id);
      };

      request.onerror = () => {
        reject(new Error("Could not insert tag"));
      };
    });
  }
}
