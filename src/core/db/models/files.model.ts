import { ETable } from "../enums";
import { IFile } from "../interfaces";
import { Table } from "./table.model";



export class Files extends Table<IFile> {

  public constructor(db: IDBDatabase) {
    super(db, ETable.Files);
  }

  protected override onInit(table: IDBObjectStore): void {    
    table.createIndex("nameIdx", "name", { unique: false });
    table.createIndex("typeIdx", "type", { unique: false }); 
  }
}
