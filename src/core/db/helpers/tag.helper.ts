import { TTagInfo } from "../types";
import { ITag } from "../interfaces";
import { Database } from "../models";
import { LogHelper } from "../../common";



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
    const tags = await (await this.getDB()).TAGS.getAll();

    if (!tags.length) {
      LogHelper.print("Seeding tags...");

      for (const tag of this.TAGS) {
        await this.create(tag);
      }
    }
  }

  public static async create(name: ITag["name"], description?: ITag["description"]): Promise<ITag> {
    const obj: TTagInfo = { name, description };
    const tag = (await this.getDB()).TAGS.create(obj);

    return tag;
  }
}
