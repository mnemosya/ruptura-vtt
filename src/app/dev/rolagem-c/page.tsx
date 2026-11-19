/**
 * PROTÓTIPO C — "Mesa". Rolagem de dois d10 (Dado Normal + Dado de
 * Sobrecarga) em que a troca é oferecida junto do dado assentado na
 * mesa e, na janela, lado a lado; quando acontece, a mesa reencena os
 * dois dados. Só design: nada é gravado, a ficha é de exemplo e a regra
 * é a do Notion (`../rolagem/_base/regra.ts`). Índice em `/dev/rolagem`.
 */

import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { PropostaC } from "./PropostaC";
import "../../mesas/[campaignId]/vtt/vtt.css";
import "../../mesas/[campaignId]/vtt/_tema/tema-forja.css";
import "../../mesas/[campaignId]/vtt/_tema/janelas-f.css";
import "../../mesas/[campaignId]/vtt/_tema/janela-dados.css";
import "../../mesas/[campaignId]/vtt/_painel/painel.css";
import "../rolagem/_base/base.css";
import "./proposta-c.css";

export const dynamic = "force-dynamic";

export default function Page() {
  assertDevRouteAllowed();
  return <PropostaC />;
}
