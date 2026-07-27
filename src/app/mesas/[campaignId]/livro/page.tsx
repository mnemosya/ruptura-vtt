/**
 * Biblioteca do Livro — sumário (checkpoint pós-v0.94, fase 10, PRD
 * §2.1.9). Rota de LEITURA para narrador e jogador (qualquer membro da
 * campanha com perfil reivindicado, mesmo guard de acesso já usado em
 * `/mesas/[campaignId]/personagens/novo`) — nunca expõe rascunho, só
 * conteúdo efetivo com `status === "published"`.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getCampaign, listCampaignProfiles } from "../../../../lib/table/storage";
import { listCapitulosEffective } from "../../../../lib/campaignContent";
import type { Campaign } from "../../../../lib/table";
import { LivroSumarioClient, type CapituloResumo } from "./LivroSumarioClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function LivroPage({ params }: PageProps) {
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
  if (!isOwner) {
    const perfis = await listCampaignProfiles(campaignId).catch(() => []);
    const temPerfil = perfis.some((p) => p.user_id === user.id);
    if (!temPerfil) {
      return (
        <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
          <h1 style={{ fontSize: 20 }}>Acesso negado</h1>
          <p style={{ fontSize: 13, opacity: 0.8 }}>
            Você precisa entrar nesta mesa por um convite e reivindicar um perfil para ler o Livro.
          </p>
          <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas mesas</Link>
        </main>
      );
    }
  }

  const docs = await listCapitulosEffective(campaignId).catch(() => []);
  const capitulos: CapituloResumo[] = docs
    .filter((doc) => (doc.payload as { status?: string }).status === "published")
    .map((doc) => {
      const payload = doc.payload as { nome?: string; descricao_curta?: string; categoria?: string; tags?: string[] };
      return {
        slug: doc.slug,
        nome: payload.nome ?? doc.nome ?? doc.slug,
        descricaoCurta: payload.descricao_curta,
        categoria: payload.categoria,
        tags: Array.isArray(payload.tags) ? payload.tags : [],
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 64px" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href={`/mesas/${campaignId}`} style={{ color: "#5ec8ff", fontSize: 13 }}>← Voltar para a mesa</Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Livro — {campaign.name}</h1>
      <p style={{ fontSize: 13, color: "#a8a8b3", marginBottom: 20 }}>
        Capítulos publicados desta mesa (oficial, override ou homebrew). Rascunhos nunca aparecem aqui.
      </p>
      {capitulos.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhum capítulo publicado ainda.</p>
      ) : (
        <LivroSumarioClient campaignId={campaignId} capitulos={capitulos} />
      )}
    </main>
  );
}
