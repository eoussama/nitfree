import { EnumHelper, TNullable } from "../../common";
import { ETable } from "../enums";



export class Table {

  protected readonly name: ETable;
  protected readonly db: IDBDatabase;

  private get tableName(): string {
    return <string>EnumHelper.toString(ETable, this.name);
  }

  protected get table(): IDBObjectStore {
    return this.db
      .transaction(this.tableName, "readwrite")
      .objectStore(this.tableName);
  }

  protected constructor(db: IDBDatabase, name: ETable) {
    this.db = db;
    this.name = name;

    this.init();
  }

  private init(): TNullable<IDBObjectStore> {
    if (this.exists()) {
      return null;
    }

    const table = this.db.createObjectStore(this.tableName, { keyPath: "id" });

    this.onInit(table);
    return table;
  }
  
  private exists(): boolean {
    return this.db.objectStoreNames.contains(this.tableName);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected onInit(_: IDBObjectStore): void { }
}
