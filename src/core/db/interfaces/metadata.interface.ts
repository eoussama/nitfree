import { IBase } from "./base.interface";



export interface IMetadata extends IBase {
  tagId: string
  fileId: string

  title: string
  favorite: boolean
  description: string
}
