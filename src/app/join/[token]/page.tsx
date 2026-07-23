/**
 * Rota REAL de entrada por convite (checkpoint v0.18): /join/[token].
 *
 * O token é validado server-side (resolveCampaignInvite → hash SHA-256
 * comparado com token_hash). Convite revogado/inativo/expirado/inexistente
 * mostra uma mensagem clara sem vazar a mesa. Convite válido reusa o
 * fluxo de entrada existente (JoinClient, variante "invite").
 *
 * Diferente de /dev/join/[campaignId] (legado dev, id cru), aqui o id da
 * mesa nunca aparece na URL — só o token opaco.
 *
 * ETAPA 12 (correção 2): antes de mostrar o JoinClient (escolha de
 * perfil/personagem, sempre anônimo por sessão opaca), esta rota agora
 * EXIGE uma sessão real do Supabase Auth (mesmo fluxo de login/cadastro
 * já usado pelo narrador — `LoginForm`/`signInWithPassword`/
 * `signUpDevNarrator`, nenhuma auth nova) e aceita o convite
 * (`accept_campaign_invite`, migration 0027), criando/ativando uma linha
 * real em `campaign_members`. É isso que agora autoriza o jogador a ler
 * conteúdo efetivo (override/homebrew) da campanha — sem essa sessão,
 * a leitura de conteúdo de campanha continua caindo no fallback oficial
 * (ver `resolveEffectiveContent.ts`), nunca vazando dado privado.
 *
 * ETAPA 12 (correção 3): `campaign_members` só prova pertencimento à
 * CAMPANHA, nunca a um `campaign_profile`/`character` específico. Esta
 * rota agora também exige reivindicar (ou criar) um perfil
 * (`ClaimProfileClient` → `claim_campaign_profile`/
 * `create_and_claim_campaign_profile`, migration 0028) antes de liberar
 * o `JoinClient` — vínculo explícito, nunca inferido por nome ou pelo
 * primeiro perfil livre.
 */

import { resolveCampaignInvite, listCampaignProfiles, expireStaleProfileSessions } from "../../../lib/table/storage";
import { listCharactersForCampaign } from "../../../lib/character/storage";
import type { CampaignProfile } from "../../../lib/table";
import type { CharacterRecord } from "../../../lib/character";
import { getCurrentUser } from "../../../lib/auth/session";
import { LoginForm } from "../../LoginForm";
import { acceptCampaignInvite } from "../../../lib/campaignContent/campaignContentServerActions";
import { listClaimableCampaignProfiles } from "../../../lib/campaignContent/campaignProfileServerActions";
import JoinClient from "../../dev/join/[campaignId]/JoinClient";
import { ClaimProfileClient } from "./ClaimProfileClient";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  not_found: "Convite não encontrado.",
  revoked: "Este convite foi revogado.",
  inactive: "Este convite está inativo.",
  expired: "Este convite expirou.",
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InviteJoinPage({ params }: PageProps) {
  const { token } = await params;

  let resolved;
  let errorMessage: string | null = null;
  try {
    resolved = await resolveCampaignInvite(token);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao resolver o convite.";
  }

  if (errorMessage) {
    return (
      <main style={{ maxWidth: 560, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Erro ao abrir o convite</h1>
        <p style={{ color: "#ff6b6b", fontSize: 13 }}>{errorMessage}</p>
      </main>
    );
  }

  if (!resolved || !resolved.ok || !resolved.campaign) {
    const label = resolved?.reason ? REASON_LABELS[resolved.reason] ?? "Convite inválido." : "Convite inválido.";
    return (
      <main style={{ maxWidth: 560, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Convite indisponível</h1>
        <p data-testid="invite-invalido" style={{ fontSize: 13, opacity: 0.8 }}>{label}</p>
        <p style={{ fontSize: 12, opacity: 0.5, marginTop: 12 }}>
          Peça um novo link ao narrador da mesa.
        </p>
      </main>
    );
  }

  const campaign = resolved.campaign;

  // Etapa 12 (correção 2): exige sessão real do Supabase Auth antes de
  // liberar a escolha de perfil/personagem — é essa sessão que autoriza
  // a leitura de conteúdo efetivo (override/homebrew) da campanha.
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main style={{ maxWidth: 420, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Entrar em &ldquo;{campaign.name}&rdquo;</h1>
        <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 20 }}>
          Entre ou crie uma conta para acessar o conteúdo desta mesa (inclusive homebrew e ajustes feitos pelo narrador). Depois de
          entrar, você volta automaticamente para este convite.
        </p>
        <LoginForm redirectTo={`/join/${token}`} context="prod" />
      </main>
    );
  }

  const aceite = await acceptCampaignInvite(token);
  if (!aceite.ok) {
    return (
      <main style={{ maxWidth: 560, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Não foi possível entrar nesta mesa</h1>
        <p style={{ color: "#ff6b6b", fontSize: 13 }}>{aceite.erro}</p>
      </main>
    );
  }

  // Etapa 12 (correção 6): `listCampaignProfiles` continua sendo a
  // função de produto (getScopedTableClient), mas desde a migration
  // 0031 a policy de SELECT restringe o jogador a ler SOMENTE o
  // próprio perfil (nunca mais todos os perfis da campanha) — por
  // isso `perfisIniciais`, para quem ainda não é dono da mesa, já vem
  // naturalmente limitada a 0 ou 1 linha (a própria). A listagem dos
  // perfis AINDA disponíveis para reivindicar vem de uma RPC mínima
  // dedicada (`listClaimableCampaignProfiles`), nunca de um SELECT
  // amplo.
  let perfisIniciais: CampaignProfile[] = [];
  let perfisReivindicaveis: { id: string; nickname: string }[] = [];
  let personagens: CharacterRecord[] = [];
  try {
    // v0.26: expira sessões velhas desta mesa antes de listar perfis — perfil expirado aparece como disponível.
    await expireStaleProfileSessions(campaign.id).catch(() => {});
    perfisIniciais = await listCampaignProfiles(campaign.id);
    perfisReivindicaveis = await listClaimableCampaignProfiles(campaign.id);
    // v0.28: escopado à mesa do convite — nunca a lista global de personagens de outras mesas.
    personagens = await listCharactersForCampaign(campaign.id);
  } catch {
    // Se perfis/personagens falharem, a página ainda mostra a mesa; o
    // JoinClient lida com lista vazia.
  }

  const perfilProprio = perfisIniciais.find((p) => p.user_id === user.id) ?? null;

  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: "0 20px" }}>
      <ClaimProfileClient
        campaignId={campaign.id}
        perfilProprio={perfilProprio}
        perfisReivindicaveis={perfisReivindicaveis}
      />
      {perfilProprio ? (
        <JoinClient
          campaign={campaign}
          perfisIniciais={perfisIniciais}
          personagens={personagens}
          variant="invite"
          inviteId={resolved.inviteId ?? null}
        />
      ) : (
        <p style={{ fontSize: 13, color: "#7d7d8a" }}>Reivindique ou crie um perfil acima para continuar.</p>
      )}
    </main>
  );
}
