import { assertDevRouteAllowed } from "../../../../lib/dev/guard";
import { GlobalShell } from "../../../mesas/_global/GlobalShell";
import PersonagensGlobaisClient, { type PersonagemLinha } from "../../../mesas/(global)/personagens/PersonagensGlobaisClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Personagens (dev) · Ruptura VTT" };

const iso = (diasAtras: number) => new Date(Date.now() - diasAtras * 86_400_000).toISOString();

const PERSONAGENS: PersonagemLinha[] = [
  { id: "p1", name: "Cyra Volt", classe: "tecnico", ranking: "D", avatarUrl: "/forja/classes/tecnico.webp", campanha: { id: "c3", nome: "Mesa Teste v0.58", role: "player" }, pendente: null, updatedAt: iso(2) },
  { id: "p2", name: "Bex Calder", classe: "face", ranking: "E", avatarUrl: "/forja/classes/face.webp", campanha: null, pendente: { campaignId: "c3", campaignName: "Mesa Teste v0.58" }, updatedAt: iso(3) },
  { id: "p3", name: "Juno Kade", classe: "vanguarda", ranking: "F", avatarUrl: "/forja/classes/vanguarda.webp", campanha: null, pendente: null, updatedAt: iso(5) },
  { id: "p4", name: "Ash Moreno", classe: "combatente", ranking: "F", avatarUrl: null, campanha: null, pendente: null, updatedAt: iso(9) },
  { id: "p5", name: "Kael Varro", classe: "vanguarda", ranking: "D", avatarUrl: "/forja/classes/vanguarda.webp", campanha: { id: "c1", nome: "Ecos de Vosek", role: "narrator" }, pendente: null, updatedAt: iso(18) },
  { id: "p6", name: "Iris Doma", classe: "ancora", ranking: "C", avatarUrl: "/forja/classes/ancora.webp", campanha: { id: "c1", nome: "Ecos de Vosek", role: "narrator" }, pendente: null, updatedAt: iso(18) },
  { id: "p7", name: "Mav Quill", classe: "face", ranking: "E", avatarUrl: null, campanha: { id: "c1", nome: "Ecos de Vosek", role: "narrator" }, pendente: null, updatedAt: iso(19) },
];

/** Personagens com dados fictícios, para revisar o visual sem login. `?vazio=1` mostra o estado sem personagens. */
export default async function PersonagensDevPage({ searchParams }: { searchParams: Promise<{ vazio?: string }> }) {
  assertDevRouteAllowed();
  const { vazio } = await searchParams;
  return (
    <GlobalShell userEmail="dev@ruptura.local" displayName="Dev" contagens={{ campanhas: 3, personagens: 7 }}>
      <PersonagensGlobaisClient
        personagens={vazio ? [] : PERSONAGENS}
        destinos={[{ id: "c1", nome: "Ecos de Vosek", narra: true }, { id: "c3", nome: "Mesa Teste v0.58", narra: false }]}
        errorInicial={null}
      />
    </GlobalShell>
  );
}
