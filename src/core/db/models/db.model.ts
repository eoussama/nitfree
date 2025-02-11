import { CONFIG } from "../../common";

import { Tags } from "./tags.model";
import { Files } from "./files.model";
import { Metadata } from "./metadata.model";



export class Database {

  private static instance: Database;
  private readonly db: Promise<IDBDatabase>;

  private TAGS: Tags;
  private FILES: Files;
  private METADATA: Metadata;

  private constructor() {
    this.db = this.init();
    Database.instance = this;
  }

  private init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let initialized = false;
      const { name, version } = CONFIG.database;
      const request = indexedDB.open(name, version);

      request.onerror = () => {
        reject(new Error("Failed to open database"));
      };

      request.onsuccess = e => {
        const req = <IDBRequest>e.target;
        const db = <IDBDatabase>req.result;

        if (!initialized) {
          this.createTables(db);
          initialized = true;
        }

        resolve(req.result);
      };

      request.onupgradeneeded = e => {
        const req = <IDBRequest>e.target;
        const db = <IDBDatabase>req.result;

        if (!initialized) {
          this.createTables(db);
          initialized = true;
        }
      };
    });
  } 

  private createTables(db: IDBDatabase): void {
    this.TAGS = new Tags(db);
    this.FILES = new Files(db);
    this.METADATA = new Metadata(db);
  }

  public static async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const instance = new Database();

        instance.db
          .then(() => resolve())
          .catch(() => reject);
      } catch(err) {
        reject(err);
      }
   });
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
