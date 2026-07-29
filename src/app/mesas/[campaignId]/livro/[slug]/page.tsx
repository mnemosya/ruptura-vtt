/**
 * Biblioteca do Livro — leitura de um capítulo (checkpoint pós-v0.94,
 * fase 10). Mesmo guard de acesso da página de sumário.
 */

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getCampaign, isCampaignMember } from "../../../../../lib/table/storage";
import { listCapitulosEffective } from "../../../../../lib/campaignContent";
import type { Campaign } from "../../../../../lib/table";

export const dynamic = "force-dynamic";

interface BlocoTexto {
  id: string;
  tipo: "texto";
  texto: string;
}
interface BlocoEntidade {
  id: string;
  tipo: "entidade";
  entidade: { tipo_conteudo: string; slug: string };
}
type Bloco = BlocoTexto | BlocoEntidade;

const TIPO_CONTEUDO_LABEL: Record<string, string> = {
  spell: "Magia",
  talent: "Talento",
  item: "Item",
  rune: "Runa",
  capitulo: "Capítulo",
};

interface PageProps {
  params: Promise<{ campaignId: string; slug: string }>;
}

export default async function LivroCapituloPage({ params }: PageProps) {
  const { campaignId, slug } = await params;
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
  if (!isOwner && !(await isCampaignMember(campaignId))) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Acesso negado</h1>
        <p style={{ fontSize: 13, opacity: 0.8 }}>
          Você precisa entrar nesta mesa por um convite para ler o Livro.
        </p>
        <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas mesas</Link>
      </main>
    );
  }

  const docs = await listCapitulosEffective(campaignId).catch(() => []);
  const publicados = docs
    .filter((doc) => (doc.payload as { status?: string }).status === "published")
    .map((doc) => ({
      slug: doc.slug,
      nome: (doc.payload as { nome?: string }).nome ?? doc.nome ?? doc.slug,
      payload: doc.payload as {
        nome?: string;
        descricao_curta?: string;
        descricao_longa?: string;
        corpo?: string;
        tags?: string[];
        blocos?: Bloco[];
      },
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const index = publicados.findIndex((c) => c.slug === slug);
  if (index === -1) notFound();
  const atual = publicados[index];
  const anterior = index > 0 ? publicados[index - 1] : null;
  const proximo = index < publicados.length - 1 ? publicados[index + 1] : null;
  const blocos = Array.isArray(atual.payload.blocos) ? atual.payload.blocos : [];

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 64px" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href={`/mesas/${campaignId}/livro`} style={{ color: "#5ec8ff", fontSize: 13 }}>← Sumário</Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>{atual.nome}</h1>
      {atual.payload.descricao_curta && (
        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>{atual.payload.descricao_curta}</p>
      )}
      {atual.payload.corpo && (
        <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 20, whiteSpace: "pre-wrap" }}>{atual.payload.corpo}</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {blocos.map((bloco) =>
          bloco.tipo === "texto" ? (
            <p key={bloco.id} style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {bloco.texto}
            </p>
          ) : bloco.entidade.tipo_conteudo === "capitulo" ? (
            <Link
              key={bloco.id}
              href={`/mesas/${campaignId}/livro/${bloco.entidade.slug}`}
              data-testid={`livro-bloco-entidade-${bloco.id}`}
              style={{ background: "#1d1e24", borderRadius: 8, padding: "10px 14px", textDecoration: "none", color: "inherit", fontSize: 13 }}
            >
              → Ver capítulo: {publicados.find((c) => c.slug === bloco.entidade.slug)?.nome ?? bloco.entidade.slug}
            </Link>
          ) : (
            <div
              key={bloco.id}
              data-testid={`livro-bloco-entidade-${bloco.id}`}
              style={{ background: "#1d1e24", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}
            >
              {TIPO_CONTEUDO_LABEL[bloco.entidade.tipo_conteudo] ?? bloco.entidade.tipo_conteudo}: {bloco.entidade.slug}
            </div>
          ),
        )}
      </div>

      <nav style={{ display: "flex", justifyContent: "space-between", marginTop: 32, fontSize: 13 }}>
        {anterior ? (
          <Link href={`/mesas/${campaignId}/livro/${anterior.slug}`} style={{ color: "#5ec8ff" }}>← {anterior.nome}</Link>
        ) : (
          <span />
        )}
        {proximo ? (
          <Link href={`/mesas/${campaignId}/livro/${proximo.slug}`} style={{ color: "#5ec8ff" }}>{proximo.nome} →</Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
