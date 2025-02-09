import { ETable } from "../enums";
import { Table } from "./table.model";
import { TNullable } from "../../common";



export class Metadata extends Table {

  public static init(db: IDBDatabase): TNullable<IDBObjectStore> {
    const table = super.init(db, ETable.Metadata);
    
    if (table) {
      table.createIndex("titleIdx", "title", { unique: false });
      table.createIndex("tagIdIdx", "tagId", { unique: true });
      table.createIndex("fileIdIdx", "fileId", { unique: false });
      table.createIndex("favoriteIdx", "favorite", { unique: false });
    }

    return table;
  }
}
