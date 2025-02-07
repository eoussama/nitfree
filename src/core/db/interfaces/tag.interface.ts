import { IEntity } from "./base.interface";



export interface ITag extends IEntity {
  name: string
  description?: string
}
