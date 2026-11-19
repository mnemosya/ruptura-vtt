/**
 * PROTÓTIPO A — "Reserva". Rolagem de dois d10 (Dado Normal + Dado de
 * Sobrecarga) com a troca na janela. Só design: nada é gravado, a ficha
 * é de exemplo e a regra é a do Notion (`../rolagem/_base/regra.ts`).
 * Índice das propostas em `/dev/rolagem`.
 */

import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { PropostaA } from "./PropostaA";
import "../../mesas/[campaignId]/vtt/vtt.css";
import "../../mesas/[campaignId]/vtt/_tema/tema-forja.css";
import "../../mesas/[campaignId]/vtt/_tema/janelas-f.css";
import "../../mesas/[campaignId]/vtt/_tema/janela-dados.css";
import "../../mesas/[campaignId]/vtt/_painel/painel.css";
import "../rolagem/_base/base.css";
import "./proposta-a.css";

export const dynamic = "force-dynamic";

export default function Page() {
  assertDevRouteAllowed();
  return <PropostaA />;
}
