import { IBase } from "../interfaces";



export type TStrip<T extends IBase> = Omit<T, "id" | "createdOn" | "updatedOn">
