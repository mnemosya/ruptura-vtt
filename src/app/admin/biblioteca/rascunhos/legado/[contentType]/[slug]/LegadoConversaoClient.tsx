"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DraftContentType } from "../../../../../../../lib/contentSchema/draftTypes";
import { criarRascunhoDeEdicaoLegado } from "../../../../../../../lib/contentSchema/legacyConversionServerActions";
import type { RelatorioConversaoLegado } from "../../../../../../../lib/contentSchema/legacyConversion";
import { buttonStyle, dangerTextStyle, primaryButtonStyle, sectionStyle, warnTextStyle } from "../../../_shared/formStyles";

const CLASSIFICACAO_LABEL: Record<string, string> = {
  conversao_direta: "Conversão direta",
  conversao_com_confirmacao: "Conversão com confirmação",
  somente_leitura: "Somente leitura",
  incompativel: "Incompatível",
  invalido: "Inválido",
};

const CLASSIFICACAO_COR: Record<string, string> = {
  conversao_direta: "#8fd6a0",
  conversao_com_confirmacao: "#e0c56b",
  somente_leitura: "#7d7d8a",
  incompativel: "#e0a06b",
  invalido: "#e08a8a",
};

function valorCurto(v: unknown): string {
  if (v === undefined) return "—";
  if (typeof v === "string") return v.length > 100 ? `${v.slice(0, 100)}…` : v;
  const s = JSON.stringify(v);
  return s.length > 100 ? `${s.slice(0, 100)}…` : s;
}

export function LegadoConversaoClient({
  contentType,
  slug,
  relatorio,
  pendentes,
}: {
  contentType: DraftContentType;
  slug: string;
  relatorio: RelatorioConversaoLegado;
  pendentes: string[];
}) {
  const router = useRouter();
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({});
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [faltando, setFaltando] = useState<string[]>([]);

  const efeitosEditaveis = relatorio.efeitos.filter((e) => e.classificacao === "conversao_direta");
  const efeitosComConfirmacao = relatorio.efeitos.filter((e) => e.classificacao === "conversao_com_confirmacao");
  const efeitosSomenteLeitura = relatorio.efeitos.filter((e) => e.classificacao === "somente_leitura");
  const efeitosIncompativeis = relatorio.efeitos.filter((e) => e.classificacao === "incompativel");
  const efeitosInvalidos = relatorio.efeitos.filter((e) => e.classificacao === "invalido");
  const camposComConfirmacao = relatorio.campos.filter((c) => c.classificacao === "conversao_com_confirmacao");

  const todasConfirmadas = pendentes.every((p) => confirmados[p]);

  async function iniciarRascunho() {
    setCriando(true);
    setErro(null);
    setFaltando([]);
    const decisoes: Record<string, unknown> = {};
    for (const p of pendentes) {
      const campo = camposComConfirmacao.find((c) => c.caminho === p);
      decisoes[p] = campo?.interpretacaoProposta ?? true;
    }
    const resultado = await criarRascunhoDeEdicaoLegado(contentType, slug, decisoes);
    setCriando(false);
    if (resultado.ok && resultado.draftId) {
      router.push(`/admin/biblioteca/rascunhos/${resultado.draftId}`);
      return;
    }
    if (resultado.pendentesDeConfirmacao) setFaltando(resultado.pendentesDeConfirmacao);
    setErro(resultado.erro ?? "Erro ao criar rascunho.");
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={{ marginBottom: 16 }}>
        <a href={`/admin/biblioteca/${contentType}/${slug}`} style={{ color: "#8fd6a0", fontSize: 13 }}>
          ← voltar ao conteúdo publicado
        </a>
      </p>

      <header style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#7d7d8a", textTransform: "uppercase" }}>Diagnóstico de conversão — conteúdo legado</div>
        <h2 style={{ fontSize: 22, margin: "4px 0" }}>{relatorio.slug}</h2>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#a8a8b3" }}>
          <span>tipo: {contentType}</span>
          <span>versão publicada: {relatorio.versaoPublicada ?? "—"}</span>
          <span>adapter: {relatorio.adapterVersion}</span>
          <span>metadata editorial: ausente (conversão a partir do payload legado)</span>
          <span style={{ color: CLASSIFICACAO_COR[relatorio.classificacaoGeral] }}>classificação geral: {CLASSIFICACAO_LABEL[relatorio.classificacaoGeral]}</span>
        </div>
      </header>

      {relatorio.bloqueado && (
        <div style={{ ...sectionStyle, borderColor: "#5c2b2b" }}>
          <h3 style={{ marginTop: 0, fontSize: 15, color: "#e08a8a" }}>Conversão bloqueada</h3>
          {relatorio.motivosBloqueio.map((m, i) => (
            <div key={i} style={dangerTextStyle}>✕ {m}</div>
          ))}
          <p style={{ fontSize: 13, color: "#7d7d8a", marginTop: 8 }}>Não é possível iniciar um rascunho de edição enquanto isso não for resolvido no conteúdo publicado.</p>
        </div>
      )}

      {camposComConfirmacao.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Campos que exigem confirmação</h3>
          {camposComConfirmacao.map((c) => (
            <label key={c.caminho} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={!!confirmados[c.caminho]} onChange={(e) => setConfirmados((p) => ({ ...p, [c.caminho]: e.target.checked }))} style={{ marginTop: 3 }} />
              <span>
                <strong style={{ fontFamily: "monospace" }}>{c.caminho}</strong>
                <br />
                <span style={{ color: "#7d7d8a" }}>original: {valorCurto(c.valorOriginal)}</span>
                {c.interpretacaoProposta !== undefined && (
                  <>
                    {" · "}
                    <span style={{ color: "#8fd6a0" }}>proposta: {valorCurto(c.interpretacaoProposta)}</span>
                  </>
                )}
                <br />
                <span style={{ color: "#e0c56b" }}>{c.motivo}</span>
                {faltando.includes(c.caminho) && <div style={dangerTextStyle}>✕ confirmação obrigatória para prosseguir</div>}
              </span>
            </label>
          ))}
        </div>
      )}

      {efeitosComConfirmacao.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Efeitos que exigem confirmação</h3>
          {efeitosComConfirmacao.map((e) => {
            const chave = `efeito:${e.id}`;
            return (
              <label key={e.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={!!confirmados[chave]} onChange={(ev) => setConfirmados((p) => ({ ...p, [chave]: ev.target.checked }))} style={{ marginTop: 3 }} />
                <span>
                  <strong>{e.tipoLegado}</strong> → {e.tipoCanonico}
                  <br />
                  <span style={{ color: "#e0c56b" }}>{e.motivo}</span>
                  {faltando.includes(chave) && <div style={dangerTextStyle}>✕ confirmação obrigatória para prosseguir</div>}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {efeitosEditaveis.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Efeitos editáveis (conversão direta)</h3>
          {efeitosEditaveis.map((e) => (
            <div key={e.id} style={{ fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: CLASSIFICACAO_COR.conversao_direta }}>●</span> {e.tipoLegado} → {e.tipoCanonico}
            </div>
          ))}
        </div>
      )}

      {(efeitosSomenteLeitura.length > 0 || efeitosIncompativeis.length > 0) && (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Efeitos preservados (não editáveis nesta etapa)</h3>
          {efeitosSomenteLeitura.map((e) => (
            <div key={e.id} style={{ fontSize: 13, marginBottom: 4, color: "#a8a8b3" }}>
              <span style={{ color: CLASSIFICACAO_COR.somente_leitura }}>●</span> {e.tipoLegado ?? "(sem tipo)"}{e.familia ? ` · família: ${e.familia}` : ""} — {e.motivo}
            </div>
          ))}
          {efeitosIncompativeis.map((e) => (
            <div key={e.id} style={{ fontSize: 13, marginBottom: 4, color: "#e0a06b" }}>
              <span style={{ color: CLASSIFICACAO_COR.incompativel }}>●</span> {e.tipoLegado} · família: {e.familia} — {e.motivo}
            </div>
          ))}
        </div>
      )}

      {efeitosInvalidos.length > 0 && (
        <div style={{ ...sectionStyle, borderColor: "#5c2b2b" }}>
          <h3 style={{ marginTop: 0, fontSize: 15, color: "#e08a8a" }}>Efeitos inválidos</h3>
          {efeitosInvalidos.map((e) => (
            <div key={e.id} style={dangerTextStyle}>✕ {e.motivo}</div>
          ))}
        </div>
      )}

      {relatorio.camposDesconhecidos.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Campos desconhecidos (preservados)</h3>
          <p style={{ fontSize: 12, color: "#7d7d8a", marginTop: 0 }}>Continuam associados ao caminho original — nunca descartados nem achatados.</p>
          {relatorio.camposDesconhecidos.map((c, i) => (
            <div key={i} style={{ fontSize: 12, fontFamily: "monospace", color: "#a8a8b3" }}>
              {c.caminho}
            </div>
          ))}
        </div>
      )}

      {relatorio.referencias.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Referências encontradas</h3>
          {relatorio.referencias.map((r, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              {r.referencia.tipoConteudo}:{r.referencia.slug}
            </div>
          ))}
        </div>
      )}

      {relatorio.riscoDePerda && (
        <div style={{ ...sectionStyle, borderColor: "#5c4326" }}>
          <p style={warnTextStyle}>⚠ Este conteúdo tem efeitos incompatíveis ou inválidos — eles continuam preservados e somente leitura; o rascunho não vai apagá-los.</p>
        </div>
      )}

      {erro && <p style={dangerTextStyle}>{erro}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 16, marginBottom: 40 }}>
        <button
          onClick={iniciarRascunho}
          disabled={criando || relatorio.bloqueado || !todasConfirmadas}
          style={{ ...primaryButtonStyle, opacity: relatorio.bloqueado || !todasConfirmadas ? 0.5 : 1 }}
          title={relatorio.bloqueado ? "Conversão bloqueada" : !todasConfirmadas ? "Confirme todos os campos ambíguos antes de continuar" : undefined}
        >
          {criando ? "Iniciando..." : "Iniciar rascunho de edição"}
        </button>
        <button onClick={() => router.push(`/admin/biblioteca/${contentType}/${slug}`)} style={buttonStyle}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
