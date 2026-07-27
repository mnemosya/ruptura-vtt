/**
 * Assistente de criação de personagem (checkpoint v0.41, PRD 3.2;
 * autorização de jogador — checkpoint pós-v0.94, fase 2 "criação
 * autônoma"). Exige login E que o usuário seja OU o narrador dono da
 * mesa OU um jogador com perfil já reivindicado nesta mesa
 * (`campaign_profiles.user_id`, migration 0028) — a RLS de
 * `characters` (migration 0030) já permite o INSERT vinculado ao
 * PRÓPRIO perfil; antes desta correção só o guard desta página negava
 * acesso a quem não fosse o dono, deixando a criação pelo jogador
 * inacessível apesar de já autorizada no banco.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getCampaign, listCampaignProfiles } from "../../../../../lib/table/storage";
import { getCharacterRules } from "../../../../../lib/content";
import { listTalentsEffective, listSpellsEffective, listItemsEffective } from "../../../../../lib/campaignContent";
import type { Campaign, CampaignProfile } from "../../../../../lib/table";
import {
  normalizeTalentContent,
  normalizeSpellContent,
  normalizeItemContent,
  type CharacterRulesPayload,
  type TalentContent,
  type SpellContent,
  type ItemContent,
} from "../../../../../lib/character";
import CreateCharacterWizardClient from "./CreateCharacterWizardClient";

/**
 * Loja restrita a raridade até incomum na criação (PRD 3.2, Etapa 6) —
 * "até incomum" inclui tudo IGUAL OU MAIS COMUM que incomum, não só o
 * rótulo "comum" — o enum real (`db_equipamentos_normalizado_v1_2.json`)
 * tem "muito_comum" abaixo de "comum". Raros e muito raros bloqueados.
 */
const RARIDADES_PERMITIDAS_NA_CRIACAO = new Set(["muito_comum", "comum", "incomum"]);

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function NovoPersonagemPage({ params }: PageProps) {
  const { campaignId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let campaign: Campaign | null = null;
  try {
    campaign = await getCampaign(campaignId);
  } catch {
    campaign = null;
  }

  if (!campaign) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Mesa não encontrada</h1>
        <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas mesas</Link>
      </main>
    );
  }

  const isOwner = campaign.owner_id === user.id;

  let perfis: CampaignProfile[] = [];
  try {
    perfis = await listCampaignProfiles(campaignId);
  } catch {
    perfis = [];
  }

  // Jogador (não-narrador): só pode entrar se já tiver um perfil
  // reivindicado NESTA mesa (migration 0028 — `claim_campaign_profile`,
  // fluxo de convite). Sem perfil reivindicado, não há a quem vincular
  // o personagem novo, então o acesso é negado (não é "mesa alheia" —
  // é "ainda não entrou nesta mesa por convite").
  const perfilProprio = perfis.find((p) => p.user_id === user.id) ?? null;
  if (!isOwner && !perfilProprio) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Acesso negado</h1>
        <p style={{ fontSize: 13, opacity: 0.8 }}>
          Você precisa entrar nesta mesa por um convite e reivindicar um perfil antes de criar um personagem.
        </p>
        <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas mesas</Link>
      </main>
    );
  }

  // Jogador só vê/vincula ao PRÓPRIO perfil (nunca a lista inteira da
  // mesa) — a RLS de `campaign_profiles`/`characters` já bloqueia
  // vincular a perfil alheio, mas a UI não deve nem oferecer a opção.
  const perfisParaWizard = isOwner ? perfis : perfilProprio ? [perfilProprio] : [];

  let regras: CharacterRulesPayload | null = null;
  try {
    const doc = await getCharacterRules();
    regras = (doc?.payload as CharacterRulesPayload | undefined) ?? null;
  } catch {
    regras = null;
  }

  // Etapas 4-6 (Vertentes/Magias, Talento inicial, Inventário): nunca
  // lista hardcoded — sempre a partir do que a Biblioteca/Editor
  // Universal publicou de verdade para esta mesa (oficial + override +
  // homebrew, via listXEffective).
  let talentos: TalentContent[] = [];
  try {
    const docs = await listTalentsEffective(campaignId);
    talentos = docs
      .map((doc) => normalizeTalentContent(doc.payload))
      .filter((t) => t.status === "published");
  } catch {
    talentos = [];
  }

  let magias: SpellContent[] = [];
  try {
    const docs = await listSpellsEffective(campaignId);
    magias = docs
      .map((doc) => normalizeSpellContent(doc.payload))
      .filter((m) => m.status === "published");
  } catch {
    magias = [];
  }

  let itensLoja: ItemContent[] = [];
  try {
    const docs = await listItemsEffective(campaignId);
    itensLoja = docs
      .map((doc) => normalizeItemContent(doc.payload))
      .filter((item) => item.raridade != null && RARIDADES_PERMITIDAS_NA_CRIACAO.has(item.raridade));
  } catch {
    itensLoja = [];
  }

  if (!regras) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Erro ao carregar regras</h1>
        <p style={{ color: "#ff6b6b", fontSize: 13 }}>
          regras_personagem não veio do banco — não é possível montar o assistente de criação sem
          atributos/perícias reais da Biblioteca.
        </p>
        <Link href={`/mesas/${campaignId}`} style={{ color: "#5ec8ff", fontSize: 13 }}>← Voltar à mesa</Link>
      </main>
    );
  }

  return (
    <CreateCharacterWizardClient
      campaign={campaign}
      regras={regras}
      perfisIniciais={perfisParaWizard}
      talentos={talentos}
      magias={magias}
      itensLoja={itensLoja}
      travarSelecaoDePerfil={!isOwner}
    />
  );
}
