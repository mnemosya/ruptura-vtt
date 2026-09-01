/**
 * Carregamento das rotas da campanha.
 *
 * Fase 5: os estados de rota da campanha não usam os `Section*` globais
 * (`src/app/_boundaries/Section*`) — aqueles servem /admin, /ficha,
 * /join e /login, áreas fora daquela reestrutura. O que se compartilha
 * é o DESENHO (`BootPanel`), não o enquadramento.
 *
 * Dois cenários caem aqui, e o arquivo precisa servir aos dois:
 *
 *  - NAVEGANDO ENTRE ROTAS DA CAMPANHA (Mesa → Bando → Livro…): a
 *    casca já está montada e PERMANECE — trilho, cabeçalho, dock e
 *    painel de sessão não piscam. `.mo-boot-stage` centraliza o painel
 *    dentro de `.rm-shell-main`, que já exclui rail/header/dock por
 *    construção (é a região que só rola o CONTEÚDO, ver mesa.css).
 *
 *  - ENTRANDO NA CAMPANHA VINDO DE FORA (do dashboard, ou por link
 *    direto): aqui o `layout.tsx` da campanha ainda está resolvendo
 *    acesso, log e roster, então a casca ainda NÃO existe — não há
 *    `.rm-shell-main` pra `min-height: 100%` resolver contra. Mesmo
 *    caso-limite aceito de `(global)/loading.tsx`: o painel perde a
 *    centralização vertical perfeita só nesse instante único (aparece
 *    perto do topo, sem quebra), porque não há chrome nenhum ali pra
 *    excluir de qualquer jeito — é o único carregamento do app que
 *    aparece sozinho, e é inerente à ordem de resolução do layout.
 *
 * Este fallback NÃO tem duração mínima garantida — o React pode
 * removê-lo a qualquer momento, assim que o conteúdo real fica pronto.
 * Quem garante a permanência mínima é `BootMinDurationOverlay`, montado
 * em `CampaignShell` (uma sobreposição independente, orientada por
 * `useLinkStatus()` dos links do trilho, não por este arquivo — ver a
 * explicação completa lá e em `bootTiming.ts`).
 */
import { BootPanel } from "../../_boundaries/BootPanel";

export default function CampaignLoading() {
  return (
    <main className="mo-boot-stage mo-scope" aria-busy="true" data-testid="campaign-loading">
      <BootPanel label="Carregando mesa" />
    </main>
  );
}
