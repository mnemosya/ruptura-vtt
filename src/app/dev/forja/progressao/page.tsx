import { assertDevRouteAllowed } from "../../../../lib/dev/guard";
import { catalogoDev } from "../catalogoDev";
import { ProgressaoDev } from "./ProgressaoDev";
import "../../../mesas/[campaignId]/vtt/_forja/forja.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "Progressão · Ruptura VTT" };

/** Escolhas prontas da prancheta, para abrir direto numa tela já preenchida (`?pronto=1`). */
const ESCOLHAS_PRANCHETA = { E: { subclasse_id: "dissecador", vertente: "cinetica", pericias: { mobilidade: 1 } }, D: { atributo: "mente" as const, pericias: {} } };

export default async function ProgressaoDevPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  assertDevRouteAllowed();
  const q = await searchParams;
  return (
    <ProgressaoDev
      catalogos={catalogoDev()}
      classeSlug={q.classe}
      caso={q.caso ?? "E"}
      tela={q.tela}
      quadro={q.quadro === "1"}
      palco={q.palco ? Number(q.palco) : undefined}
      escolhas={q.pronto === "1" ? ESCOLHAS_PRANCHETA : {}}
    />
  );
}
