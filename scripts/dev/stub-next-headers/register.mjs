/** Registra o stub. Usado via `node --import` antes do script de teste. */
import { register } from "node:module";
register("./hooks.mjs", import.meta.url);
