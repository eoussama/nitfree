import { IEntity } from "./base.interface";



export interface IMetadata extends IEntity {
  tagId: string
  fileId: string

  title: string
  favorite: boolean
  description: string
}
