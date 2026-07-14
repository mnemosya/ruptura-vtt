/**
 * Detalhe administrativo de um conteúdo (Etapa 2) — preview humano +
 * diagnóstico técnico. Read-only: sem editar, duplicar, publicar ou
 * arquivar. `talent` é o único caso com N sub-resultados (um por
 * nível) — os demais content_types sempre têm exatamente 1.
 */

import { notFound } from "next/navigation";
import { getContentDocument, type ContentType } from "../../../../../lib/content";
import { adaptarParaAdmin, CONTENT_TYPE_REGISTRY } from "../../../../../lib/contentSchema";
import { CLASSIFICACAO_LEGADO_LABEL, formatarValor } from "../../labels";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { EffectsPanel } from "./EffectsPanel";

export const dynamic = "force-dynamic";

const CONTENT_TYPES_VALIDOS = new Set(Object.keys(CONTENT_TYPE_REGISTRY));

interface PageProps {
  params: Promise<{ contentType: string; slug: string }>;
}

export default async function ContentDetailPage({ params }: PageProps) {
  const { contentType: contentTypeParam, slug } = await params;
  if (!CONTENT_TYPES_VALIDOS.has(contentTypeParam)) notFound();
  const contentType = contentTypeParam as ContentType;

  const documento = await getContentDocument(contentType, slug);
  if (!documento) notFound();

  const payload = (documento.payload as Record<string, unknown>) ?? {};
  const admin = adaptarParaAdmin(contentType, slug, payload);
  const definicao = CONTENT_TYPE_REGISTRY[contentType];

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <a href="/admin/biblioteca" style={{ color: "#8fd6a0", fontSize: 13 }}>
          ← voltar para a lista
        </a>
      </p>

      <header style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#7d7d8a", textTransform: "uppercase" }}>{definicao.label}</div>
        <h2 style={{ fontSize: 26, margin: "4px 0 8px" }}>{documento.nome ?? documento.slug}</h2>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "#a8a8b3" }}>
          <span>slug: {documento.slug}</span>
          <span>status: {documento.status}</span>
          <span>versão: {documento.version ?? "—"}</span>
          <span>pack: {documento.source_pack_id} @ {documento.source_pack_version ?? "—"}</span>
          <span>atualizado em: {new Date(documento.updated_at).toLocaleString("pt-BR")}</span>
          <span>legado: {CLASSIFICACAO_LEGADO_LABEL[admin.resultados[0]?.adaptacao.classificacaoLegado ?? "somente_leitura"]}</span>
        </div>
      </header>

      {admin.resultados.map((resultado, indice) => {
        const { canonico } = resultado.adaptacao;
        const titulo = admin.resultados.length > 1 ? `Nível ${String(canonico.classificacao.nivel ?? indice + 1)} — ${canonico.nome}` : "Preview";

        return (
          <section key={canonico.slug} style={{ border: "1px solid #26262e", borderRadius: 10, padding: 18, marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, marginTop: 0 }}>{titulo}</h3>

            {canonico.descricaoCurta && <p style={{ color: "#c9c9d1" }}>{canonico.descricaoCurta}</p>}

            {Object.keys(canonico.classificacao).length > 0 && (
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 4, fontSize: 13, marginBottom: 12 }}>
                {Object.entries(canonico.classificacao)
                  .filter(([, v]) => v != null)
                  .map(([chave, valor]) => (
                    <div key={chave} style={{ display: "contents" }}>
                      <dt style={{ color: "#7d7d8a" }}>{chave}</dt>
                      <dd style={{ margin: 0 }}>{formatarValor(valor)}</dd>
                    </div>
                  ))}
              </dl>
            )}

            {canonico.tags.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {canonico.tags.map((tag) => (
                  <span key={tag} style={{ fontSize: 11, background: "#22232b", borderRadius: 12, padding: "2px 8px", marginRight: 6, color: "#a8a8b3" }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {(canonico.duracao || canonico.resistencia) && (
              <div style={{ fontSize: 13, color: "#a8a8b3", marginBottom: 12 }}>
                {canonico.duracao && <div>Duração: {canonico.duracao.texto ?? canonico.duracao.tipo}</div>}
                {canonico.resistencia && (
                  <div>
                    Resistência: {canonico.resistencia.pericia ?? "—"} — CD {canonico.resistencia.cdFormula ?? canonico.resistencia.cdValor ?? "—"}
                  </div>
                )}
              </div>
            )}

            <h4 style={{ fontSize: 13, color: "#a8a8b3", marginBottom: 6 }}>Efeitos</h4>
            <EffectsPanel efeitos={canonico.efeitos} />

            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "#7d7d8a" }}>Diagnóstico técnico</summary>
              <div style={{ marginTop: 10 }}>
                <DiagnosticsPanel
                  validacao={resultado.validacao}
                  referencias={canonico.referencias}
                  camposDesconhecidos={resultado.adaptacao.camposDesconhecidos}
                />
              </div>
            </details>
          </section>
        );
      })}

      <details>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "#7d7d8a" }}>Modo avançado — payload bruto (JSON)</summary>
        <pre style={{ background: "#111116", padding: 12, borderRadius: 8, fontSize: 12, overflowX: "auto", marginTop: 8 }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}
