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
 * login/cadastro → aceitar convite (`campaign_members` ativo) →
 * personagens controlados (`character_controllers`) nesta campanha.
 * Com 1 personagem controlado, abre direto a ficha; com 0, oferece
 * criar; com vários, lista para escolher (seletor completo é Fase 5).
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveCampaignInvite, getCampaign } from "../../../lib/table/storage";
import { listControlledCharacters } from "../../../lib/character/storage";
import { getCurrentUser } from "../../../lib/auth/session";
import { LoginForm } from "../../LoginForm";
import { acceptCampaignInvite } from "../../../lib/campaignContent/campaignContentServerActions";

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

  if (!resolved || !resolved.ok || !resolved.campaignId || !resolved.campaignName) {
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

  const campaignId = resolved.campaignId!;
  const campaignName = resolved.campaignName!;

  // Exige sessão real do Supabase Auth antes de aceitar o convite —
  // login/cadastro únicos, sem etapa de perfil.
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main style={{ maxWidth: 420, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Entrar em &ldquo;{campaignName}&rdquo;</h1>
        <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 20 }}>
          {resolved.kind === "email"
            ? "Este convite é para um e-mail específico. Entre ou crie uma conta com ele para acessar esta campanha."
            : "Entre ou crie uma conta para acessar esta campanha. Depois de entrar, você volta automaticamente para este convite."}
        </p>
        <LoginForm redirectTo={`/join/${token}`} context="prod" lockedEmail={resolved.kind === "email" ? (resolved.email ?? undefined) : undefined} />
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

  // Membership real criada por `acceptCampaignInvite` (campaign_members)
  // — a partir daqui `getCampaign` funciona sob `campaigns_member_select`.
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return (
      <main style={{ maxWidth: 560, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Mesa não encontrada</h1>
        <p style={{ fontSize: 13, opacity: 0.8 }}>A mesa deste convite não está mais disponível.</p>
      </main>
    );
  }

  let personagens = [] as Awaited<ReturnType<typeof listControlledCharacters>>;
  try {
    personagens = await listControlledCharacters(campaign.id);
  } catch {
    personagens = [];
  }

  // Único personagem controlado: abre direto (aditivo §10 — "jogador
  // com 1 personagem: abre diretamente esse personagem, sem tela de
  // seleção"). Seletor completo para múltiplos é Fase 5.
  if (personagens.length === 1) {
    redirect(`/ficha?campaignId=${campaign.id}&characterId=${personagens[0].id}`);
  }

  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Você entrou em &ldquo;{campaign.name}&rdquo;</h1>

      {personagens.length === 0 ? (
        <>
          <p data-testid="join-sem-personagem" style={{ fontSize: 13, opacity: 0.8, marginBottom: 16 }}>
            Você ainda não controla um personagem nesta campanha.
          </p>
          <Link
            href={`/mesas/${campaign.id}/vtt`}
            data-testid="join-criar-personagem"
            style={{ color: "#5ec8ff", fontSize: 13 }}
          >
            Criar personagem →
          </Link>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>Seus personagens nesta campanha:</p>
          <ul data-testid="join-personagens-lista" style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0 }}>
            {personagens.map((personagem) => (
              <li key={personagem.id}>
                <Link
                  href={`/ficha?campaignId=${campaign.id}&characterId=${personagem.id}`}
                  data-testid={`join-abrir-ficha-${personagem.id}`}
                  style={{ color: "#5ec8ff", fontSize: 13 }}
                >
                  {personagem.name} →
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <p style={{ marginTop: 24 }}>
        <Link href="/mesas" style={{ color: "#7d7d8a", fontSize: 12 }}>← Minhas mesas</Link>
      </p>
    </main>
  );
}
