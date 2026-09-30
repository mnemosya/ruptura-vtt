/**
 * Rota REAL de entrada por convite: /join/[token].
 *
 * O token é validado server-side (resolveCampaignInvite → hash SHA-256
 * comparado com token_hash). Convite revogado/inativo/expirado/inexistente
 * mostra uma mensagem clara sem vazar a mesa.
 *
 * Fase 1 do plano de contas/campanhas/convites/personagens (revisão 4 —
 * docs/relatorios/AUDITORIA_REFATORACAO_CONTAS_CAMPANHAS_CONVITES_
 * PERSONAGENS.md): a etapa de "reivindicar/criar perfil" foi removida
 * por completo (não existe mais `campaign_profiles`). O fluxo agora é:
 * login/cadastro → confirmação explícita ("Entrar na campanha") →
 * aceitar convite (`campaign_members` ativo) → a mesa (`/mesas/<id>`).
 * Quem já participa (ou é o dono) vai direto pra mesa, sem confirmar.
 */

import { redirect } from "next/navigation";
import { resolveCampaignInvite } from "../../../lib/table/storage";
import { getCurrentUser } from "../../../lib/auth/session";
import { resolveCampaignAccess } from "../../../lib/campaign/access";
import { TelaJoinConfirmar, TelaJoinLogin, TelaJoinMensagem } from "./JoinTelas";

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
    return <TelaJoinMensagem titulo="Erro ao abrir o convite" texto={errorMessage} dica="Tente abrir o link de novo em instantes." />;
  }

  if (!resolved || !resolved.ok || !resolved.campaignId || !resolved.campaignName) {
    const label = resolved?.reason ? REASON_LABELS[resolved.reason] ?? "Convite inválido." : "Convite inválido.";
    return <TelaJoinMensagem titulo="Convite indisponível" texto={label} dica="Peça um novo link ao narrador da mesa." />;
  }

  const campaignId = resolved.campaignId!;
  const campaignName = resolved.campaignName!;

  // Exige sessão real do Supabase Auth antes de aceitar o convite —
  // login/cadastro únicos, sem etapa de perfil.
  const user = await getCurrentUser();
  if (!user) {
    return (
      <TelaJoinLogin
        token={token}
        campanha={campaignName}
        emailTravado={resolved.kind === "email" ? (resolved.email ?? undefined) : undefined}
      />
    );
  }

  // Já participa (ou é o dono): nada a aceitar — vai direto pra mesa.
  // Sem isto, o narrador que abrisse o próprio link viraria membro
  // "player" da própria campanha.
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind === "ok") redirect(`/mesas/${campaignId}`);

  // Abrir o link não muda nada: a entrada só acontece no clique
  // explícito (`ConfirmarEntrada` → `aceitarConviteAction`), que depois
  // leva sempre à mesa.
  return <TelaJoinConfirmar token={token} campanha={campaignName} email={user.email} />;
}
