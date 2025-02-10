import pkg from "../../../../package.json";
import type { TConfig } from "../types";



export const CONFIG: TConfig = {
  name: pkg.name,
  version: pkg.version,
  database: {
    version: 1,
    name: pkg.name
  }
};
