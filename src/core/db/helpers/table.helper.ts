import { ETable } from "../enums";
import { EnumHelper, TNullable } from "../../common";



export class TableHelper {
  public static create(db: IDBDatabase, table: ETable): void {
    switch(table) {
      case ETable.Tags: {
        this.createTags(db);
        break;
      }

      case ETable.Files: {
        this.createFiles(db);
        break;
      }

      case ETable.Metadata: {
        this.createMetadata(db);
        break;
      }

      default: {
        throw new Error("Invalid table");
      }
    }
  }

  private static createTags(db: IDBDatabase): void {
    const store = this.createStore(db, ETable.Tags);

    if (store) {
      store.createIndex("nameIdx", "name", { unique: false });
    }
  }

  private static createFiles(db: IDBDatabase): void {
    const store = this.createStore(db, ETable.Files);

    if (store) {
      store.createIndex("nameIdx", "name", { unique: false });
      store.createIndex("typeIdx", "type", { unique: false });
    } 
  }

  private static createMetadata(db: IDBDatabase): void {
    const store = this.createStore(db, ETable.Metadata);

    if (store) {
      store.createIndex("titleIdx", "title", { unique: false });
      store.createIndex("tagIdIdx", "tagId", { unique: true });
      store.createIndex("fileIdIdx", "fileId", { unique: false });
      store.createIndex("favoriteIdx", "favorite", { unique: false });
    }
  }

  private static createStore(db: IDBDatabase, table: ETable): TNullable<IDBObjectStore> {
    if (this.exists(db, table)) {
      return null;
    }
    
    const name = EnumHelper.toString(ETable, table);
    const store = db.createObjectStore(<string>name, { keyPath: "id" });

    return store;
  }

  private static exists(db: IDBDatabase, table: ETable): boolean {
    const name = EnumHelper.toString(ETable, table);
    return db.objectStoreNames.contains(<string>name);
  }
}
