import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { Forja } from "../../mesas/[campaignId]/vtt/_forja/Forja";
import { catalogoDev } from "./catalogoDev";
import "../../mesas/[campaignId]/vtt/_forja/forja.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "Forja de Refratário · Ruptura VTT" };

/**
 * A Forja de Refratário isolada, com o catálogo canônico de
 * `content/v12`. É onde ela é revisada enquanto ainda não substitui o
 * assistente de criação da mesa (Fases 2 a 4 do plano da Forja).
 */
export default function ForjaDevPage() {
  assertDevRouteAllowed();
  return (
    <div style={{ height: "100dvh" }}>
      <Forja catalogos={catalogoDev()} />
    </div>
  );
}
