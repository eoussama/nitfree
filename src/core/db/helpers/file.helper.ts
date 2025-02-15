import { Database } from "../models";
import { IFile, IMetadata } from "../interfaces";
import { TFileInfo, TFileMeta, TMetadataInfo } from "../types";



export class FileHelper {
  private static db: Database;

  private static async getDB(): Promise<Database> {
    if (!this.db) {
      this.db = await Database.getInstance();
    }

    return this.db;
  }

  public static async create(obj: TFileMeta): Promise<[IFile, IMetadata]> {
    const db = await this.getDB();

    const fileInfo: TFileInfo = { data: obj.data };
    const file = await db.FILES.create(fileInfo);

    const metadataInfo: TMetadataInfo = {
      fileId: file.id,
      tagId: obj.tagId,
      title: obj.title,
      favorite: obj.favorite,
      description: obj.description
    };

    const metadata = await db.METADATA.create(metadataInfo);

    return [file, metadata];
  }
}
