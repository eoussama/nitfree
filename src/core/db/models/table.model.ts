import { ETable } from "../enums";
import { EnumHelper, TNullable } from "../../common";



export class Table {

  private static instance: Table;

  protected readonly name: ETable;
  protected readonly db: IDBDatabase;

  private get tableName(): string {
    return <string>EnumHelper.toString(ETable, this.name);
  }

  protected get table(): IDBTransaction {
    return this.db.transaction(this.tableName, "readwrite");
  }

  protected constructor(db: IDBDatabase, name: ETable) {
    this.db = db;
    this.name = name;

    Table.instance = this;
  }

  private init(): TNullable<IDBObjectStore> {
    if (this.exists()) {
      return null;
    }

    return this.db.createObjectStore(this.tableName, { keyPath: "id" });
  }
  
  private exists(): boolean {
    return this.db.objectStoreNames.contains(this.tableName);
  }

  public static init(db: IDBDatabase, name: ETable): TNullable<IDBObjectStore> {
    return new Table(db, name).init();
  }

  public static getInstance(): Table {
    if (!this.instance) {
      throw new Error("table was not initialized");
    }

    return this.instance;
  }
}
