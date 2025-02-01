import { openDB } from 'idb'

import { CONFIG } from '../consts'
import type { IDatabase } from '../interfaces'

export class DBHelper {
  static async init(): Promise<void> {
    await openDB<IDatabase>(
      CONFIG.database.name,
      CONFIG.database.version,
      {

      }
    )
  }
}
