import { ETable } from "../enums";
import { Table } from "./table.model";



export class Metadata extends Table {

  public constructor(db: IDBDatabase) {
    super(db, ETable.Metadata);
  }

  protected override onInit(table: IDBObjectStore): void {
    table.createIndex("titleIdx", "title", { unique: false });
    table.createIndex("tagIdIdx", "tagId", { unique: true });
    table.createIndex("fileIdIdx", "fileId", { unique: false });
    table.createIndex("favoriteIdx", "favorite", { unique: false });
  }
}
