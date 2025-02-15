import { TFileInfo } from "./fileInfo.type";
import { TMetadataInfo } from "./metadataInfo.type";



export type TFileMeta = Omit<TFileInfo & TMetadataInfo, "fileId">
