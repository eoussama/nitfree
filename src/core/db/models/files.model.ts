import { ETable } from "../enums";
import { Table } from "./table.model";



export class Files extends Table {

  public constructor(db: IDBDatabase) {
    super(db, ETable.Files);
  }

  public override onInit(table: IDBObjectStore): void {
    table.createIndex("nameIdx", "name", { unique: false });
    table.createIndex("typeIdx", "type", { unique: false }); 
  }
}
