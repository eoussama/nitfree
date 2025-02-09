import { ETable } from "../enums";
import { Table } from "./table.model";
import { TNullable } from "../../common";



export class Files extends Table {

  public static init(db: IDBDatabase): TNullable<IDBObjectStore> {
    const table = super.init(db, ETable.Files);
    
    if (table) {
      table.createIndex("nameIdx", "name", { unique: false });
      table.createIndex("typeIdx", "type", { unique: false });
    }

    return table;
  }
}
