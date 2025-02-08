import { ETable } from "../enums";
import { CONFIG } from "../../common";
import { TableHelper } from "../helpers";



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

        TableHelper.create(db, ETable.Tags);
        TableHelper.create(db, ETable.Files);
        TableHelper.create(db, ETable.Metadata);
      };
    });
  } 

  //public async getAll<T>(table: ETable): Promise<Array<T>> {
  //  throw "TODO: implement"
  //}
}
