/**
 * Livro — leitura de um capítulo. Mesmo guard do sumário: o layout da
 * campanha já resolve login/acesso antes daqui (ver nota em
 * `../page.tsx`), então esta página só cuida do conteúdo.
 *
 * Fase 5: decoração deliberadamente mínima — é a única tela da área de
 * campanha que é texto longo de ponta a ponta. Medida de leitura
 * (`.rm-prose`, ~68ch) em vez da largura cheia da coluna de conteúdo.
 *
 * A leitura NÃO é encapsulada em `.catch(() => [])` (auditoria da
 * Fase 5): aqui o degradê era pior que no sumário — lista vazia levava
 * direto a `notFound()`, ou seja, uma falha de leitura virava um 404
 * afirmando que o capítulo NÃO EXISTE. `notFound()` agora só é
 * alcançável quando a lista carregou de verdade e o slug não está
 * nela; qualquer falha sobe para o `error.tsx` da campanha (logger
 * central + "Tentar de novo").
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { listCapitulosEffective } from "../../../../../lib/campaignContent";
import { comFalhaInjetavel } from "../../../../../lib/dev/faultInjection";

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
  const access = await resolveCampaignAccess(campaignId);
  if (access.kind !== "ok") return null; // layout já mostra o estado certo

  const docs = await comFalhaInjetavel("livro", () => listCapitulosEffective(campaignId));
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
    <main className="rm-page rm-prose">
      <p style={{ marginBottom: 16 }}>
        <Link href={`/mesas/${campaignId}/livro`} className="rv-focusable" style={{ color: "var(--cy)", fontSize: 12.5 }}>
          ← Sumário
        </Link>
      </p>
      <h1 className="rm-page-title" style={{ marginBottom: 4 }}>{atual.nome}</h1>
      {atual.payload.descricao_curta && (
        <p className="rm-faint" style={{ marginBottom: 16 }}>{atual.payload.descricao_curta}</p>
      )}
      {atual.payload.corpo && <p style={{ marginBottom: 20 }}>{atual.payload.corpo}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {blocos.map((bloco) =>
          bloco.tipo === "texto" ? (
            <p key={bloco.id}>{bloco.texto}</p>
          ) : bloco.entidade.tipo_conteudo === "capitulo" ? (
            <Link
              key={bloco.id}
              href={`/mesas/${campaignId}/livro/${bloco.entidade.slug}`}
              data-testid={`livro-bloco-entidade-${bloco.id}`}
              className="rm-doclist-item rv-focusable"
            >
              → Ver capítulo: {publicados.find((c) => c.slug === bloco.entidade.slug)?.nome ?? bloco.entidade.slug}
            </Link>
          ) : (
            <div key={bloco.id} data-testid={`livro-bloco-entidade-${bloco.id}`} className="rm-doclist-item">
              {TIPO_CONTEUDO_LABEL[bloco.entidade.tipo_conteudo] ?? bloco.entidade.tipo_conteudo}: {bloco.entidade.slug}
            </div>
          ),
        )}
      </div>

      <nav className="rm-prose-nav">
        {anterior ? (
          <Link href={`/mesas/${campaignId}/livro/${anterior.slug}`} className="rv-focusable">← {anterior.nome}</Link>
        ) : (
          <span />
        )}
        {proximo ? (
          <Link href={`/mesas/${campaignId}/livro/${proximo.slug}`} className="rv-focusable">{proximo.nome} →</Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
