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
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  /**
   * O servidor lê `content/` em tempo de execução (schemas do validador,
   * ajustes e revisão do Compêndio) por caminhos montados com
   * `process.cwd()`, que o rastreamento de arquivos não enxerga. Sem isto,
   * o deploy na Vercel sai sem esses arquivos e as rotas quebram com ENOENT.
   */
  outputFileTracingIncludes: { "/**": ["./content/**/*"] },
  /** Não há página na raiz: o app começa em /mesas, que manda para /login quem não entrou. */
  async redirects() {
    return [{ source: "/", destination: "/mesas", permanent: false }];
  },
};

export default nextConfig;
