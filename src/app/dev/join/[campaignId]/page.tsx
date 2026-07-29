/**
 * Página de DEBUG de entrada por "link de mesa" — sem design
 * definitivo, mesmo espírito de /dev/table e /dev/character-sheet.
 *
 * O "link" é literalmente a URL com o `campaignId` em texto puro — NÃO
 * é um convite seguro (sem token, sem expiração, sem revogação).
 * Prefira um convite real (/join/&lt;token&gt;).
 *
 * Fase 1 (revisão 4): não existe mais "perfil" nem entrada anônima por
 * sessão — mesmo aqui, exige login real (Supabase Auth) e mostra os
 * personagens que a conta logada controla nesta campanha
 * (`character_controllers`). Deixou de ser um bypass de autenticação
 * (antes, qualquer um com o UUID podia "entrar" sem login); continua
 * sendo um bypass só do token de convite — ver aviso acima.
 */

import Link from "next/link";
import { getCampaign } from "../../../../lib/table/storage";
import { listControlledCharacters } from "../../../../lib/character/storage";
import { getCurrentUser } from "../../../../lib/auth/session";
import { LoginForm } from "../../../LoginForm";
import { assertDevRouteAllowed } from "../../../../lib/dev/guard";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function DevJoinPage({ params }: PageProps) {
  assertDevRouteAllowed();
  const { campaignId } = await params;

  let campaign;
  let errorMessage: string | null = null;
  try {
    campaign = await getCampaign(campaignId);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao carregar a mesa.";
  }

  if (errorMessage) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Erro ao carregar a mesa</h1>
        <p style={{ color: "#ff6b6b" }}>{errorMessage}</p>
      </main>
    );
  }

  if (!campaign) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Mesa não encontrada</h1>
        <p style={{ opacity: 0.7, fontSize: 13 }}>
          Nenhuma mesa com id <code>{campaignId}</code>. Confirme o link em <code>/dev/table</code>.
        </p>
      </main>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return (
      <main style={{ maxWidth: 420, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Entrar em &ldquo;{campaign.name}&rdquo; (dev)</h1>
        <LoginForm redirectTo={`/dev/join/${campaignId}`} context="dev" />
      </main>
    );
  }

  const personagens = await listControlledCharacters(campaignId).catch(() => []);

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px 80px" }}>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>/dev/join/{campaign.id} — entrada DEV por id cru.</p>
      <p style={{ opacity: 0.5, fontSize: 11, marginBottom: 16 }}>
        NÃO é um convite seguro (sem token/expiração/revogação) — prefira /join/&lt;token&gt;.
      </p>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>{campaign.name}</h1>

      {personagens.length === 0 ? (
        <>
          <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>Você não controla nenhum personagem nesta campanha.</p>
          <Link href={`/mesas/${campaign.id}/personagens/novo`} style={{ color: "#5ec8ff", fontSize: 13 }}>Criar personagem →</Link>
        </>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0 }}>
          {personagens.map((personagem) => (
            <li key={personagem.id}>
              <Link href={`/dev/character-sheet?campaignId=${campaign.id}&characterId=${personagem.id}`} style={{ color: "#5ec8ff", fontSize: 13 }}>
                {personagem.name} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
