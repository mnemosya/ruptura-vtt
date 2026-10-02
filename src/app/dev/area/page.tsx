import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { GlobalShell } from "../../mesas/_global/GlobalShell";
import MesasDashboardClient, { type CampaignCardData } from "../../mesas/MesasDashboardClient";
import type { Campaign } from "../../../lib/table";

export const dynamic = "force-dynamic";

export const metadata = { title: "Área autenticada · Ruptura VTT" };

const agora = Date.now();
const iso = (diasAtras: number) => new Date(agora - diasAtras * 86_400_000).toISOString();

function campanha(id: string, name: string, regiao: string | null, dias: number): Campaign {
  return {
    id, name, regiao, owner_id: "eu", created_at: iso(90), updated_at: iso(dias),
    current_round: 1, current_scene: 1, turn_track: null as unknown as Campaign["turn_track"], turn_track_version: 0,
  } as Campaign;
}

const CAMPANHAS: CampaignCardData[] = [
  {
    campaign: campanha("c1", "Ecos de Vosek", "beldran", 4), role: "narrator", controlledCharacterCount: null,
    memberCount: 4, characterCount: 5, people: [{ userId: "p1", name: "Ruptura Player" }],
    latestSession: { id: "s1", campaign_id: "c1", started_at: iso(4), ended_at: iso(3.9), empty_since: null, confirmation_deadline: null },
    narratorOnline: false, playerCount: 0,
  },
  {
    campaign: campanha("c2", "Cinzas de Varnha", "vastra", 18), role: "narrator", controlledCharacterCount: null,
    memberCount: 2, characterCount: 3, people: [], narratorOnline: false, playerCount: 0, latestSession: null,
  },
  {
    campaign: campanha("c3", "Mesa Teste v0.58", null, 60), role: "player", controlledCharacterCount: 1,
    memberCount: null, characterCount: 1, people: [], narratorOnline: false, playerCount: 0, latestSession: null,
  },
];

/** A casca global e Minhas Campanhas com dados fictícios, para revisar o visual sem login. */
export default function AreaDevPage() {
  assertDevRouteAllowed();
  return (
    <GlobalShell userEmail="dev@ruptura.local" displayName="Dev">
      <MesasDashboardClient
        campanhasIniciais={CAMPANHAS}
        errorInicial={null}
        currentUserId="eu"
        currentUserName="Dev"
        presencaDaRede={{ eu: true }}
        presencaIndisponivel={false}
      />
    </GlobalShell>
  );
}
