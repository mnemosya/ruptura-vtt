/**
 * Fase 5: estados de rota da campanha deixam de usar os `Section*`
 * globais (`src/app/_boundaries`) — aqueles seguem servindo /admin,
 * /ficha, /join, /login e o dashboard, áreas fora desta reestrutura, e
 * restilizá-los mudaria todas elas junto. Este arquivo renderiza DENTRO
 * da casca (é fallback de Suspense dos filhos do layout), então os
 * tokens `rm-*` já resolvem aqui.
 */
export default function CampaignLoading() {
  return (
    <main className="rm-boundary" aria-busy="true">
      <p className="rm-boundary-msg">Carregando mesa…</p>
    </main>
  );
}
