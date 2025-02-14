import { TStrip } from "../types";
import { ITag } from "../interfaces";
import { Database } from "../models";



export class TagHelper {

  private static db: Database;
  private static readonly TAGS = ["Other"];

  private static async getDB(): Promise<Database> {
    if (!this.db) {
      this.db = await Database.getInstance();
    }

    return this.db;
  }

  public static async seed(): Promise<void> {
    for (const tag of this.TAGS) {
      this.create(tag);
    }
  }

  public static async create(name: ITag["name"], description?: ITag["description"]): Promise<ITag> {
    const obj: TStrip<ITag> = { name, description };
    const tag = (await this.getDB()).TAGS.create(obj);

    return tag;
  }
}
