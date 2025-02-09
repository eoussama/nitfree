import { CONFIG } from "../../common";

import { Tags } from "./tags.model";
import { Files } from "./files.model";
import { Metadata } from "./metadata.model";



export class Database {

  private static instance: Database;
  private readonly db: Promise<IDBDatabase>;

  private constructor() {
    this.db = this.init();
    Database.instance = this;
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

  public static init(): void {
    new Database();
  }

  public static async getInstance(): Promise<Database> {
    return new Promise((resolve, reject) => {
      if (!this.instance) {
        return reject(new Error("database was not initialized"));
      }

      const instance = new Database();
      instance.db.then(() => resolve(instance)).catch(reject);
    });
  }
}
