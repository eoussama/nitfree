import { Database } from "../models";



export class FileHelper {
  private static db: Database;

  private static async getDB(): Promise<Database> {
    if (!this.db) {
      this.db = await Database.getInstance();
    }

    return this.db;
  }
}
