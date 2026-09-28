import { readFileSync } from "node:fs";

/**
 * A versão exibida no menu vem do `package.json`, não de um literal na
 * interface: o literal dizia `v0.0.1` enquanto o pacote já estava em
 * `0.1.0`, e uma versão exibida que não corresponde ao que roda é pior
 * do que nenhuma — é o tipo de coisa que se usa para relatar bug.
 */
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
