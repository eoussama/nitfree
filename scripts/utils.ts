import { resolve } from "node:path";
import process from "node:process";

import { bgCyan, black } from "kolorist";
import { LogHelper } from "../src/core";



export const port = Number(process.env.PORT || "") || 3303;
export const r = (...args: string[]) => resolve(__dirname, "..", ...args);
export const isDev = process.env.NODE_ENV !== "production";
export const isFirefox = process.env.EXTENSION === "firefox";

export function log(name: string, message: string) {
  LogHelper.print(black(bgCyan(` ${name} `)), message);
}
