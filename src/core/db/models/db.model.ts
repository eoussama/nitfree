import { CONFIG } from "../../common";

import { Tags } from "./tags.model";
import { Files } from "./files.model";
import { Metadata } from "./metadata.model";



export class Database {
  readonly db: Promise<IDBDatabase>;

  constructor() {
    this.db = this.init();
  }

  private init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const { name, version } = CONFIG.database;
      const request = indexedDB.open(name, version);

      request.onerror = () => {
        reject(new Error("Failed to open database"));
      };

      request.onsuccess = e => {
        const req = <IDBRequest>e.target;
        resolve(req.result);
      };

      request.onupgradeneeded = e => {
        const req = <IDBRequest>e.target;
        const db = <IDBDatabase>req.result;

        this.createTables(db);
     };
    });
  } 

  private createTables(db: IDBDatabase): void {
    Tags.init(db);
    Files.init(db);
    Metadata.init(db);
  }
}
