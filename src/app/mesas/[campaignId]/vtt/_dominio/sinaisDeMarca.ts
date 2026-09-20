/**
 * Os quatro sinais que `vtt_marks.sinal` aceita, com rótulo e glifo —
 * numa fonte só (TOOL-01).
 *
 * `MapaHex` já trazia escrito que o mapa e a janela "nunca mostram
 * desenhos diferentes pro mesmo sinal", e ainda assim mantinha a própria
 * cópia do mapeamento ao lado da de `PainelMarcar`. Duas cópias da mesma
 * tabela é como elas divergem: alguém troca o ícone num lugar, o outro
 * continua desenhando o antigo, e a marca no mapa deixa de parecer o
 * botão que a criou.
 *
 * O CONJUNTO não é escolha de interface: são os quatro valores que a
 * coluna aceita. Acrescentar um quinto é mudança de banco, não de
 * iconografia.
 *
 * ── Escolha dos glifos ───────────────────────────────────────────────
 *
 * O critério é a silhueta a 16–24px, onde detalhe interno some e só a
 * forma geral distingue. Os quatro foram escolhidos para não
 * compartilharem contorno:
 *
 *   alvo    círculo com cruz      (Crosshair)
 *   perigo  triângulo             (TriangleAlert)
 *   rota    linha sinuosa         (Route)
 *   nota    quadrado com dobra    (StickyNote)
 *
 * `Navigation` (seta) saiu de `rota`: a seta é o cursor, e a mesma forma
 * apontando em dois papéis diferentes é justamente o que confunde num
 * mapa cheio. `FileText` saiu de `nota` porque, reduzido, um documento
 * com linhas vira um retângulo listrado difícil de separar de qualquer
 * outro retângulo; a dobra do bilhete sobrevive à redução.
 */

import { Crosshair, Route, StickyNote, TriangleAlert, type LucideIcon } from "lucide-react";

export interface SinalDeMarca {
  valor: "alvo" | "perigo" | "rota" | "nota";
  rotulo: string;
  /** Legenda curta do botão — cabe em uma palavra abreviada. */
  sub: string;
  Icone: LucideIcon;
}

export const SINAIS_MARCA: readonly SinalDeMarca[] = [
  { valor: "alvo", rotulo: "Alvo", sub: "prioridade", Icone: Crosshair },
  { valor: "perigo", rotulo: "Perigo", sub: "ameaça", Icone: TriangleAlert },
  { valor: "rota", rotulo: "Rota", sub: "deslocam.", Icone: Route },
  { valor: "nota", rotulo: "Nota", sub: "informação", Icone: StickyNote },
] as const;

export type SinalMarcaUi = SinalDeMarca["valor"];

/** Glifo por sinal — o mapa desenha a partir desta mesma tabela. */
export const GLIFO_DO_SINAL: Record<string, LucideIcon> =
  Object.fromEntries(SINAIS_MARCA.map((s) => [s.valor, s.Icone]));
