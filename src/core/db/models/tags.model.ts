import { ETable } from "../enums";
import { Table } from "./table.model";
import { TNullable } from "../../common";



export class Tags extends Table {

  public static init(db: IDBDatabase): TNullable<IDBObjectStore> {
    const table = super.init(db, ETable.Tags);
    
    if (table) {
      table.createIndex("nameIdx", "name", { unique: false });
    }

    return table;
  }
}
