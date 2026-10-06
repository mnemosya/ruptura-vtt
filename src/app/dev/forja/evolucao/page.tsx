import { assertDevRouteAllowed } from "../../../../lib/dev/guard";
import { catalogoDev } from "../catalogoDev";
import { EvolucaoDev } from "./EvolucaoDev";
import "../../../mesas/[campaignId]/vtt/_forja/forja.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "Forja de evolução · Ruptura VTT" };

/** A Forja de evolução isolada: um personagem fictício no Ranking E subindo até o C. Selar não grava nada aqui. */
export default function EvolucaoDevPage() {
  assertDevRouteAllowed();
  return <EvolucaoDev catalogos={catalogoDev()} />;
}
