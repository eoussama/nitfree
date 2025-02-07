import { IEntity } from "./base.interface";



export interface IFile extends IEntity {
  data: Blob
  type: string
  name: string
}
