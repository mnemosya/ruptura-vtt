/**
 * Layout compartilhado de TUDO sob /mesas — hoje só existe para expor
 * o slot paralelo `@modal`.
 *
 * `/mesas/personagens` e `/mesas/[campaignId]/personagens` continuam
 * cada uma renderizando seu próprio `<GlobalShell>` (nada muda aí);
 * este layout só embrulha `{children}` sem alterar nada visualmente —
 * a única razão de existir é dar um ancestral comum para o slot
 * `@modal`, que a rota interceptada `@modal/(...)ficha` usa para abrir
 * o Console do Personagem por CIMA da página atual (Personagens, por
 * exemplo) em vez de navegar para /ficha e substituí-la.
 *
 * `default.tsx` do slot devolve `null` — nas rotas em que ninguém
 * "entrou" no modal (toda navegação normal dentro de /mesas), o slot
 * simplesmente não renderiza nada.
 */

export default function MesasLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
