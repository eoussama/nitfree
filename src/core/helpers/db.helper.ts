import { openDB } from "idb";

import { CONFIG } from "../consts";
import type { IDatabase } from "../interfaces";
import { LogHelper } from "./log.helper";



export class DBHelper {
  static async init(): Promise<void> {
    LogHelper.print(`Creating '${CONFIG.database.name}' database of version '${CONFIG.database.version}'...`);

    await openDB<IDatabase>(
      CONFIG.database.name,
      CONFIG.database.version,
      {

      }
    );

    LogHelper.print("Database created!")
  }
}
