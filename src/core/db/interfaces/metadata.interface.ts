import { TNullable } from "../../common";
import { IBase } from "./base.interface";



export interface IMetadata extends IBase {
  fileId: string
  tagId: TNullable<string>

  title: string
  favorite: boolean
  description: string
}
