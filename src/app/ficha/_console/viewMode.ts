/**
 * Modo de visualização do Console — Painel (colunas 1/2 fixas + aba
 * ativa) ou Foco (só a aba ativa, colunas 1/2 viram a aba especial
 * "Personagem"). Ver spec "Alteração do Console do Personagem: modos
 * Painel e Foco". Tipo isolado nesse arquivo (não em `tabs.ts` nem em
 * `CharacterConsole.tsx`) porque é usado tanto por `TabRail` quanto
 * por `CharacterConsole` — evita import circular entre os dois.
 */
export type ViewMode = "painel" | "foco";
