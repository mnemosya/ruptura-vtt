"use server";

/**
 * Administração de mesa a partir do painel — jogadores, convites e
 * controle de personagem.
 *
 * Existe para que "Jogadores e convites" e "Configurar acesso" deixem
 * de ser LINKS. Antes, os dois navegavam para
 * `/mesas/[campaignId]/jogadores-e-convites` e para a página de
 * Personagens, o que arrancava a pessoa do VTT (URL nova, árvore
 * remontada, câmera e seleção perdidas). Agora abrem em janela interna,
 * e estas ações são a fronteira de dados delas.
 *
 * NENHUMA regra nova: tudo delega às funções canônicas de
 * `lib/table/storage.ts` e `lib/character/storage.ts`, que já são as
 * usadas pelas páginas dedicadas. O que muda é só o ponto de entrada.
 *
 * As páginas dedicadas continuam existindo e continuam sendo o lugar
 * das operações completas — a janela cobre o que se faz no meio de uma
 * sessão, sem sair dela.
 */

import {
  createCampaignInvite,
  getCampaignParticipantInfo,
  listCampaignInvites,
  listCampaignRoster,
  removeCampaignMember,
  revokeCampaignInvite,
} from "../../../../../../lib/table/storage";
import type { CampaignInvite } from "../../../../../../lib/table";
import {
  grantCharacterControl,
  listCharacterControllers,
  listCharactersForNarratorCampaign,
  revokeCharacterControl,
  type PermissaoPersonagem,
} from "../../../../../../lib/character/storage";
import { exigirNarradorPainel, mensagemDeErro, type ResultadoPainel } from "./comum";

export interface ParticipanteAdmin {
  userId: string;
  displayName: string;
  role: "narrator" | "player";
  /** Só o narrador dono recebe e-mail (RPC `get_campaign_participant_info`). */
  email: string | null;
}

export interface ConviteAdmin {
  id: string;
  label: string | null;
  kind: "email" | "clean";
  email: string | null;
  ativo: boolean;
  criadoEm: string;
  expiraEm: string | null;
  ativadoEm: string | null;
}

export interface DadosJogadoresConvites {
  participantes: ParticipanteAdmin[];
  convites: ConviteAdmin[];
}

function paraConviteAdmin(c: CampaignInvite): ConviteAdmin {
  return {
    id: c.id,
    label: c.label,
    kind: c.kind,
    email: c.email,
    ativo: c.is_active && !c.revoked_at,
    criadoEm: c.created_at,
    expiraEm: c.expires_at,
    ativadoEm: c.activated_at,
  };
}

export async function lerJogadoresConvitesAction(campaignId: string): Promise<ResultadoPainel<DadosJogadoresConvites>> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const [roster, convites, info] = await Promise.all([
      listCampaignRoster(campaignId),
      listCampaignInvites(campaignId),
      getCampaignParticipantInfo(campaignId).catch(() => new Map()),
    ]);
    return {
      ok: true,
      dados: {
        participantes: roster.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
          role: p.role,
          email: info.get(p.userId)?.email ?? null,
        })),
        convites: convites.map(paraConviteAdmin),
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao carregar jogadores e convites.") };
  }
}

/** Cria um convite limpo (reutilizável) e devolve o LINK completo — o token bruto só existe aqui, uma vez. */
export async function criarConviteAction(campaignId: string, rotulo: string, baseUrl: string): Promise<ResultadoPainel<{ link: string }>> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const { rawToken } = await createCampaignInvite(campaignId, rotulo.trim() || undefined);
    // `baseUrl` vem do browser (`window.location.origin`) só para montar
    // o link exibido — nunca é usado em decisão de autorização.
    const origem = /^https?:\/\/[^\s/]+$/.test(baseUrl) ? baseUrl : "";
    return { ok: true, dados: { link: `${origem}/join/${rawToken}` } };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao criar o convite.") };
  }
}

export async function revogarConviteAction(campaignId: string, inviteId: string): Promise<ResultadoPainel> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    await revokeCampaignInvite(inviteId);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao revogar o convite.") };
  }
}

export async function removerParticipanteAction(campaignId: string, userId: string): Promise<ResultadoPainel> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    await removeCampaignMember(campaignId, userId);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao remover o participante.") };
  }
}

// =====================================================================
// Configurar acesso a um personagem
// =====================================================================

export interface DadosAcessoPersonagem {
  personagemNome: string;
  /** Contas com acesso a este personagem agora, e com qual permissão. */
  controladores: { userId: string; permissao: PermissaoPersonagem }[];
  /** Jogadores ativos da campanha — quem ainda não tem acesso é candidato em "Adicionar". */
  jogadores: { userId: string; displayName: string }[];
}

export async function lerAcessoPersonagemAction(campaignId: string, characterId: string): Promise<ResultadoPainel<DadosAcessoPersonagem>> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const [controles, roster, personagens] = await Promise.all([
      listCharacterControllers(campaignId),
      listCampaignRoster(campaignId),
      listCharactersForNarratorCampaign(campaignId),
    ]);
    const personagem = personagens.find((p) => p.id === characterId);
    if (!personagem) return { ok: false, erro: "Personagem não encontrado nesta campanha." };
    return {
      ok: true,
      dados: {
        personagemNome: personagem.name,
        controladores: controles
          .filter((c) => c.character_id === characterId)
          .map((c) => ({ userId: c.user_id, permissao: c.permissao ?? "editar" })),
        jogadores: roster.filter((r) => r.role === "player").map((r) => ({ userId: r.userId, displayName: r.displayName })),
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao carregar o acesso do personagem.") };
  }
}

/**
 * Concede (ou troca) a permissão de uma conta sobre o personagem, ou a
 * remove com `null`. Conceder a quem já tem acesso só muda a permissão.
 */
export async function definirPermissaoAction(
  campaignId: string,
  characterId: string,
  userId: string,
  permissao: PermissaoPersonagem | null,
): Promise<ResultadoPainel> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    if (permissao) await grantCharacterControl(characterId, userId, permissao);
    else await revokeCharacterControl(characterId, userId);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, permissao ? "Falha ao definir a permissão." : "Falha ao remover o acesso.") };
  }
}
