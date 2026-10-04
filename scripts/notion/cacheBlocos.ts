/**
 * Cache local dos blocos do Notion, para a sincronização rápida (--rapido).
 *
 * Toda sincronização pela linha de comando guarda a árvore de blocos de cada página lida em
 * .cache/notion-blocos/<pageId>.json. Com --rapido, o nível de cima das páginas é sempre relido
 * (tabelas, callouts, ordem, títulos), mas o conteúdo de blocos recolhíveis e outros blocos com
 * filhos vem do cache. Blocos sem cache (novos) são lidos normalmente, e --reler="TÍTULO A,TÍTULO B"
 * relê por inteiro os blocos com esses títulos (e quem os contém).
 *
 * As imagens não são baixadas de novo: a chave da imagem no Storage ignora a parte do link que
 * expira, então imagens de blocos guardados já foram copiadas numa sincronização anterior.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BlocoNotion } from "../../src/lib/compendio/converter";
import type { ClienteNotion, OpcoesClienteNotion } from "../../src/lib/compendio/notion";

const PASTA = join(process.cwd(), ".cache", "notion-blocos");

const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Texto do bloco (título do recolhível, do cabeçalho etc.), sem formatação. */
function textoDoBloco(b: BlocoNotion): string {
  const dados = b[b.type] as { rich_text?: { plain_text: string }[] } | undefined;
  return (dados?.rich_text ?? []).map((t) => t.plain_text).join("");
}

export function criarCacheBlocos(reler: string[] = []) {
  const guardados = new Map<string, BlocoNotion[]>();
  if (existsSync(PASTA)) {
    const indexar = (blocos: BlocoNotion[]) => {
      for (const b of blocos) if (b.filhos) { guardados.set(b.id, b.filhos); indexar(b.filhos); }
    };
    for (const arq of readdirSync(PASTA)) if (arq.endsWith(".json")) indexar(JSON.parse(readFileSync(join(PASTA, arq), "utf8")));
  }
  const alvos = new Set(reler.map(chave).filter(Boolean));
  // "VIGOR" também casa com "VIGOR (C)": basta o título começar pelo nome indicado.
  const indicado = (b: BlocoNotion) => { const t = chave(textoDoBloco(b)); return [...alvos].some((a) => t === a || t.startsWith(`${a} `)); };
  const releEste = (b: BlocoNotion): boolean => indicado(b) || (guardados.get(b.id) ?? []).some(releEste);
  let reaproveitados = 0;

  const opcoes: OpcoesClienteNotion = {
    reaproveitar(b) {
      const filhos = guardados.get(b.id);
      if (!filhos || releEste(b)) return undefined;
      reaproveitados++;
      return structuredClone(filhos);
    },
  };

  /** Guarda a árvore de cada página lida, para a próxima sincronização rápida. */
  function guardar(cliente: ClienteNotion): ClienteNotion {
    return {
      ...cliente,
      async blocos(id) {
        const blocos = await cliente.blocos(id);
        mkdirSync(PASTA, { recursive: true });
        writeFileSync(join(PASTA, `${id.replace(/-/g, "")}.json`), JSON.stringify(blocos));
        return blocos;
      },
    };
  }

  return { opcoes, guardar, reaproveitados: () => reaproveitados, vazio: guardados.size === 0 };
}
