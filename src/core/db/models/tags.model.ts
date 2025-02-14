import { ETable } from "../enums";
import { ITag } from "../interfaces";
import { Table } from "./table.model";



export class Tags extends Table<ITag> {

  public constructor(db: IDBDatabase) {
    super(db, ETable.Tags);
  }

  protected override onInit(table: IDBObjectStore): void {
    table.createIndex("nameIdx", "name", { unique: false });
  }
}
