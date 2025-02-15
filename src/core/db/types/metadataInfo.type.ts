import { TStrip } from "./strip.type";
import { IMetadata } from "../interfaces";



export type TMetadataInfo = TStrip<Omit<IMetadata, "tagId"> & Partial<Pick<IMetadata, "tagId">>>
