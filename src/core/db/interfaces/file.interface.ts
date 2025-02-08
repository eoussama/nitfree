import { IBase } from "./base.interface";



export interface IFile extends IBase {
  data: Blob
  type: string
  name: string
}
