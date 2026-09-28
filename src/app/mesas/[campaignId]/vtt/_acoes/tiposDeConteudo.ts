/**
 * Os quatro tipos de conteúdo que uma mesa edita.
 *
 * Mora FORA de `campanhaActions.ts` por uma regra do Next, não por
 * gosto: um arquivo `"use server"` só pode exportar funções async, e
 * uma constante exportada dali derruba a rota inteira em tempo de
 * execução ("can only export async functions, found object") — sem
 * erro de tipo, sem erro de build, só a página em branco.
 *
 * Servidor e janela leem daqui, então continuam sendo a mesma lista.
 */

import type { DraftContentType } from "../../../../../lib/contentSchema";

export const TIPOS_DE_CONTEUDO: { id: DraftContentType; label: string }[] = [
  { id: "spell", label: "Magia" },
  { id: "talent", label: "Talento" },
  { id: "item", label: "Item / Equipamento" },
  { id: "rune", label: "Runa" },
];

/**
 * A loja da CRIAÇÃO só vai até incomum (PRD 3.2, Etapa 6) — e "até
 * incomum" inclui tudo igual ou mais comum, não só o rótulo "comum":
 * o enum real tem "muito_comum" abaixo dele. Raro e muito raro ficam
 * de fora.
 */
export const RARIDADES_PERMITIDAS_NA_CRIACAO = new Set(["muito_comum", "comum", "incomum"]);
