import { IBase } from "./base.interface";



export interface ITable<T extends IBase> {
  create(model: Omit<T, "id" | "createdOn" | "updatedOn">): Promise<string>
}
