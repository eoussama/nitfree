import { ETable } from "../enums";
import { Table } from "./table.model";



export class Tags extends Table {
  public constructor(db: IDBDatabase) {
    super(db, ETable.Tags);
  }

  protected override onInit(table: IDBObjectStore): void {
    table.createIndex("nameIdx", "name", { unique: false });
  }
}
