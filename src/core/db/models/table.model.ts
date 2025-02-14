import { EnumHelper, TNullable } from "../../common";
import { ETable } from "../enums";
import { BaseHelper } from "../helpers";
import { IBase } from "../interfaces";
import { TStrip } from "../types";



export class Table<T extends IBase> {

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

  public get(id: IBase["id"]): Promise<T> {
    return new Promise((resolve, reject) => {
      const request = this.table.get(id);

      request.onsuccess = e => {
        const target = <IDBRequest>e.target;
        resolve(target.result);
      };

      request.onerror = () => {
        reject(new Error("Could not fetch object"));
      };
    });
  }
  
  public create(obj: TStrip<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const value = BaseHelper.create(obj);
      const request = this.table.add(value);

      request.onsuccess = () => {
        resolve(value);
      };

      request.onerror = () => {
        reject(new Error("Could not insert object"));
      };
    });
  }

  public update(id: IBase["id"], obj: Partial<TStrip<T>>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.get(id).then(oldValue => {
        const newValue = BaseHelper.update(oldValue, obj);
        const request = this.table.put(newValue);

        request.onsuccess = () => {
          resolve(newValue);
        };

        request.onerror = () => {
          reject(new Error("Could not update object"));
        };
      });
    });
  }
 }
