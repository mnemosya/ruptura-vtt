/**
 * Assistente de criação de personagem (checkpoint v0.41, PRD 3.2).
 *
 * Fase 1 do plano de contas/campanhas/convites/personagens (revisão 4):
 * exige login E que o usuário seja participante ATIVO da campanha
 * (`is_campaign_member` — narrador dono OU jogador com `campaign_members`
 * ativo). Não existe mais "perfil" — a RPC `complete_character_creation`
 * (migration 0054) já autoriza pela mesma checagem e concede controle
 * (`character_controllers`) automaticamente à conta que cria.
 *
 * Permitir qualquer participante ativo criar pelo wizard é uma decisão
 * provisória desta fase — a política final de "quem pode criar
 * personagem livremente" é uma decisão de produto pendente (ver §12 do
 * relatório de auditoria), não bloqueada por esta página.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getCampaign, isCampaignMember } from "../../../../../lib/table/storage";
import { getCharacterRules } from "../../../../../lib/content";
import { listTalentsEffective, listSpellsEffective, listItemsEffective } from "../../../../../lib/campaignContent";
import type { Campaign } from "../../../../../lib/table";
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

  // Jogador (não-narrador): só pode entrar se for participante ATIVO
  // desta campanha (aceitou um convite — `campaign_members`). Não é
  // "mesa alheia" — é "ainda não entrou nesta mesa por convite".
  const isMember = isOwner || (await isCampaignMember(campaignId));
  if (!isMember) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Acesso negado</h1>
        <p style={{ fontSize: 13, opacity: 0.8 }}>
          Você precisa entrar nesta mesa por um convite antes de criar um personagem.
        </p>
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
      talentos={talentos}
      magias={magias}
      itensLoja={itensLoja}
    />
  );
}
