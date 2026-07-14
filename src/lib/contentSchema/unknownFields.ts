/**
 * Preservação de campos desconhecidos (aditivo §5.5/§13.3).
 *
 * Regra: um adapter nunca descarta um campo do payload legado só porque
 * não o reconhece. Ele declara explicitamente quais chaves mapeou; tudo
 * que sobrar vira `CampoDesconhecido`, preservado para exibição no modo
 * avançado e para remontagem do payload original.
 */

import type { CampoDesconhecido } from "./types";

/**
 * Retorna as chaves de `raw` que NÃO estão em `chavesMapeadas`, como
 * campos desconhecidos com caminho `prefixo.chave`.
 */
export function coletarCamposDesconhecidos(
  raw: Record<string, unknown> | undefined | null,
  chavesMapeadas: readonly string[],
  prefixo = "",
  motivo = "Campo presente no payload legado sem representação no envelope canônico desta etapa.",
): CampoDesconhecido[] {
  if (!raw) return [];
  const conhecidas = new Set(chavesMapeadas);
  const resultado: CampoDesconhecido[] = [];
  for (const [chave, valor] of Object.entries(raw)) {
    if (conhecidas.has(chave)) continue;
    if (valor === undefined) continue;
    resultado.push({ caminho: prefixo ? `${prefixo}.${chave}` : chave, valor, motivo });
  }
  return resultado;
}

/**
 * Marca um campo inteiro como preservado-mas-não-interpretado (ex.:
 * `estatisticas` de item, decisão registrada em
 * docs/SCHEMA_CANONICO_CONTEUDO_V1.md §7.3).
 */
export function marcarCampoSomenteLeitura(caminho: string, valor: unknown, motivo: string): CampoDesconhecido[] {
  if (valor === undefined || valor === null) return [];
  return [{ caminho, valor, motivo }];
}
