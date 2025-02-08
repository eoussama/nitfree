import { IBase } from "./base.interface";



export interface IMetadata extends IBase {
  fileId: string
  tagId?: string

  title: string
  favorite: boolean
  description: string
}
