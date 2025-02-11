import { CONFIG } from "../../common";

import { Tags } from "./tags.model";
import { Files } from "./files.model";
import { Metadata } from "./metadata.model";



export class Database {

  private static instance: Database;
  private readonly db: Promise<IDBDatabase>;

  public TAGS!: Tags;
  public FILES!: Files;
  public METADATA!: Metadata;

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

  public static async getInstance(): Promise<Database> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.instance) {
          this.instance = new Database();

          return this.instance.db
            .then(() => resolve(this.instance))
            .catch(() => reject(new Error("Database could not be created!")));
        }

        resolve(this.instance);
      } catch(e) {
        reject(e);
      }
    });
  }
}
