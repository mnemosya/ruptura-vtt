/**
 * Harness de teste ISOLADO para `PainelSessao` (a superfície única de
 * `CampaignShell.tsx`) — existe porque, na Fase 2 da reestrutura da
 * área de campanha, essa superfície foi construída mas `painelSessao`
 * nunca é passado em produção (o `SessionPanel` real só chega na
 * Fase 3). Sem conteúdo de verdade dentro dela, nenhum browser check
 * consegue exercitar abertura/fechamento, `Escape`, retorno de foco,
 * backdrop, trava de scroll, fechamento por navegação ou a decisão de
 * diálogo NÃO-MODAL (Tab/Shift+Tab saindo livremente, sem prender foco
 * — ver `CampaignShell.tsx` para a justificativa completa) — e um
 * "10/10" que não passa por nenhum desses caminhos não prova nada
 * sobre eles.
 *
 * Monta o MESMO `CampaignShell` real (não uma cópia), com
 * `painelSessao` preenchido por três elementos focáveis reais (para o
 * teste de foco-não-preso ter mais de um item pra Tab percorrer antes
 * de sair) e uma marca de montagem (`data-mount-id`) que só muda se o
 * componente remontar — é o que prova "instância única" ao navegar
 * entre as duas subrotas deste harness.
 *
 * Gated por `assertDevRouteAllowed()`: inacessível em produção sem a
 * flag `DEV_ROUTES_ENABLED`, mesma regra das outras 5 rotas `/dev`.
 */

import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { CampaignShellDrawerHarness } from "./CampaignShellDrawerHarness";

export default function CampaignShellDrawerLayout({ children }: { children: React.ReactNode }) {
  assertDevRouteAllowed();
  return <CampaignShellDrawerHarness>{children}</CampaignShellDrawerHarness>;
}
