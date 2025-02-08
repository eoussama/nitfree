import { TNullable } from "./nullable.type";



export type TUnsafe<T> = TNullable<T> | undefined
