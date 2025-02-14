import { ETable } from "../enums";
import { IFile } from "../interfaces";
import { Table } from "./table.model";



export class Files extends Table<IFile> {

  public constructor(db: IDBDatabase) {
    super(db, ETable.Files);
  }
}
