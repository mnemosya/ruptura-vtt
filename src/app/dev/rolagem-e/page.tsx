/**
 * PROTÓTIPO E — "Carta". Sem janela: o teste é uma carta que vira no
 * pé do palco; a do Sobrecarga desliza ao lado. Só design: nada é
 * gravado, a ficha é de exemplo e a regra é a do Notion
 * (`../rolagem/_base/regra.ts`). Índice das propostas em `/dev/rolagem`.
 */

import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { PropostaE } from "./PropostaE";
import "../../mesas/[campaignId]/vtt/vtt.css";
import "../../mesas/[campaignId]/vtt/_tema/tema-forja.css";
import "../../mesas/[campaignId]/vtt/_tema/janelas-f.css";
import "../../mesas/[campaignId]/vtt/_painel/painel.css";
import "../rolagem/_base/base.css";
import "../rolagem/_base/compor.css";
import "./proposta-e.css";

export const dynamic = "force-dynamic";

export default function Page() {
  assertDevRouteAllowed();
  return <PropostaE />;
}
