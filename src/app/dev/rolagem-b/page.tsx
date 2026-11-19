/**
 * PROTÓTIPO B — "Registro". Rolagem de dois d10 (Dado Normal + Dado de
 * Sobrecarga) com a decisão no cartão do Chat Log. Só design: nada é
 * gravado, a ficha é de exemplo e a regra é a do Notion
 * (`../rolagem/_base/regra.ts`). Índice das propostas em `/dev/rolagem`.
 */

import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { PropostaB } from "./PropostaB";
import "../../mesas/[campaignId]/vtt/vtt.css";
import "../../mesas/[campaignId]/vtt/_tema/tema-forja.css";
import "../../mesas/[campaignId]/vtt/_tema/janelas-f.css";
import "../../mesas/[campaignId]/vtt/_tema/janela-dados.css";
import "../../mesas/[campaignId]/vtt/_painel/painel.css";
import "../rolagem/_base/base.css";
import "./proposta-b.css";

export const dynamic = "force-dynamic";

export default function Page() {
  assertDevRouteAllowed();
  return <PropostaB />;
}
