/**
 * TEMPO E CLIMA — a janela real (`JanelaTempo`) com os dados exatos da
 * prancheta "Tempo e clima · A · painel de comando", pra medir as duas
 * lado a lado:
 *   RAIZ_APP="[data-testid=tempo-board]" node scripts/dev/compare-board.mjs TempoA.dc.html "http://localhost:3000/dev/tempo"
 */

import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { Bancada } from "./Bancada";

export const dynamic = "force-dynamic";

export default function Page() {
  assertDevRouteAllowed();
  return <Bancada />;
}
