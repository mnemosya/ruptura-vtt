/**
 * Assistente de criação de personagem (checkpoint v0.41, PRD 3.2) —
 * rota própria em vez de inflar o dashboard da mesa. Exige login E que
 * o narrador seja o dono da mesa (mesmo guard de
 * `/mesas/[campaignId]`).
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getCampaign, listCampaignProfiles } from "../../../../../lib/table/storage";
import { getCharacterRules } from "../../../../../lib/content";
import { listTalentsEffective } from "../../../../../lib/campaignContent";
import type { Campaign, CampaignProfile } from "../../../../../lib/table";
import type { CharacterRulesPayload } from "../../../../../lib/character";
import CreateCharacterWizardClient, { type TalentoNivel1Option } from "./CreateCharacterWizardClient";

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

  if (campaign.owner_id !== user.id) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Acesso negado</h1>
        <p style={{ fontSize: 13, opacity: 0.8 }}>Esta mesa não pertence à sua conta.</p>
        <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas mesas</Link>
      </main>
    );
  }

  let regras: CharacterRulesPayload | null = null;
  try {
    const doc = await getCharacterRules();
    regras = (doc?.payload as CharacterRulesPayload | undefined) ?? null;
  } catch {
    regras = null;
  }

  let perfis: CampaignProfile[] = [];
  try {
    perfis = await listCampaignProfiles(campaignId);
  } catch {
    perfis = [];
  }

  // Etapa 5 (Talento inicial): só oferece escolha se a Biblioteca de
  // talentos responder de verdade — nunca lista hardcoded (item 6 do
  // pedido). Achata cada talento nos níveis "nivel 1" publicados.
  let talentosNivel1: TalentoNivel1Option[] = [];
  try {
    const docs = await listTalentsEffective(campaignId);
    talentosNivel1 = docs.flatMap((doc) => {
      const payload = doc.payload as { niveis?: { nivel?: number; slug?: string; nome?: string; descricao_curta?: string }[] } | null;
      const niveis = payload?.niveis ?? [];
      return niveis
        .filter((n) => n.nivel === 1 && n.slug && n.nome)
        .map((n) => ({
          slug: n.slug as string,
          nome: `${doc.nome ?? doc.slug} — ${n.nome}`,
          descricao_curta: n.descricao_curta,
        }));
    });
  } catch {
    talentosNivel1 = [];
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
      perfisIniciais={perfis}
      talentosNivel1={talentosNivel1}
    />
  );
}
