import { TNullable } from "../../common";
import { IBase } from "./base.interface";



export interface ITag extends IBase {
  name: string
  description: TNullable<string>
}
