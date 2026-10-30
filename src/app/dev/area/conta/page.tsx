import { assertDevRouteAllowed } from "../../../../lib/dev/guard";
import { GlobalShell } from "../../../mesas/_global/GlobalShell";
import ContaClient from "../../../mesas/(global)/conta/ContaClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Conta (dev) · Ruptura VTT" };

/** Conta com dados fictícios, para revisar o visual sem login (salvar exige sessão de verdade). */
export default function ContaDevPage() {
  assertDevRouteAllowed();
  return (
    <GlobalShell userEmail="dev@ruptura.local" displayName="Dev" contagens={{ campanhas: 3, personagens: 7 }}>
      <ContaClient email="dev@ruptura.local" displayNameInicial="Dev" avatarPathInicial={null} contagens={{ campanhas: 3, personagens: 7, narradas: 2 }} />
    </GlobalShell>
  );
}
