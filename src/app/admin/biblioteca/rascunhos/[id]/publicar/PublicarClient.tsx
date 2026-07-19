"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RevisaoPublicacao } from "../../../../../../lib/contentSchema/publishReview";
import { publicarRascunho } from "../../../../../../lib/contentSchema/publishServerActions";
import { CONTENT_TYPE_REGISTRY } from "../../../../../../lib/contentSchema/contentTypeRegistry";
import { MODO_AUTOMACAO_COR, MODO_AUTOMACAO_LABEL } from "../../../labels";
import { buttonStyle, dangerTextStyle, inputStyle, primaryButtonStyle, sectionStyle, warnTextStyle } from "../../_shared/formStyles";
import { DiffView } from "../../_shared/DiffView";

type RevisaoCliente = Omit<RevisaoPublicacao, "corpo" | "metadataEfeitos">;

const BASE_STATUS_LABEL: Record<RevisaoCliente["baseStatus"], string> = {
  sem_origem: "conteúdo novo (sem base publicada)",
  atual: "base atual (sem conflito)",
  mudou: "CONFLITO — a base publicada mudou",
  removido: "base removida/arquivada",
};

const CATEGORIA_IMPACTO_LABEL: Record<string, string> = {
  somente_texto: "Somente texto/apresentação",
  afeta_novas_aquisicoes: "Afeta novas aquisições",
  afeta_leitura_dinamica: "Afeta leitura dinâmica de instâncias",
  pode_exigir_migracao: "Pode exigir migração de instâncias",
  impacto_nao_determinado: "Impacto não determinado",
};

export function PublicarClient({ revisao }: { revisao: RevisaoCliente }) {
  const router = useRouter();
  const [resumo, setResumo] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [errosServidor, setErrosServidor] = useState<string[]>([]);

  const definicao = CONTENT_TYPE_REGISTRY[revisao.contentType];
  const bloqueadoPorConflito = revisao.baseStatus === "mudou" || revisao.baseStatus === "removido";

  async function confirmar() {
    setPublicando(true);
    setErro(null);
    setErrosServidor([]);
    const r = await publicarRascunho(revisao.draftId, revisao.draftVersion, resumo);
    setPublicando(false);
    if (r.ok) {
      router.push(`/admin/biblioteca/${revisao.contentType}/${revisao.slug}`);
      return;
    }
    if (r.erros && r.erros.length > 0) setErrosServidor(r.erros);
    setErro(r.erro ?? "Falha ao publicar.");
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={{ marginBottom: 16 }}>
        <a href={`/admin/biblioteca/rascunhos/${revisao.draftId}`} style={{ color: "#8fd6a0", fontSize: 13 }}>
          ← voltar para o rascunho
        </a>
      </p>

      <header style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#7d7d8a", textTransform: "uppercase" }}>Revisar e publicar — {definicao.label}</div>
        <h2 style={{ fontSize: 24, margin: "4px 0 8px" }}>{revisao.nome || revisao.slug}</h2>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "#a8a8b3" }}>
          <span>slug: {revisao.slug}</span>
          <span>{revisao.isNovo ? "conteúdo novo" : "edição de publicado"}</span>
          <span>versão atual: {revisao.versaoAtual ?? "—"}</span>
          <span>próxima versão: <strong style={{ color: "#8fd6a0" }}>{revisao.proximaVersao}</strong></span>
          <span style={{ color: bloqueadoPorConflito ? "#e08a8a" : "#a8a8b3" }}>base: {BASE_STATUS_LABEL[revisao.baseStatus]}</span>
        </div>
        {revisao.basePayloadHash && (
          <div style={{ fontSize: 11, color: "#7d7d8a", marginTop: 4, fontFamily: "monospace" }}>
            base_hash: {revisao.basePayloadHash.slice(0, 16)}… · publicado_hash: {(revisao.publicadoAtualHash ?? "—").slice(0, 16)}…
          </div>
        )}
      </header>

      {revisao.erros.length > 0 && (
        <div style={{ ...sectionStyle, borderColor: "#5c2b2b" }}>
          <h3 style={{ marginTop: 0, fontSize: 15, color: "#e08a8a" }}>Erros bloqueantes</h3>
          {revisao.erros.map((e, i) => (
            <div key={i} style={dangerTextStyle}>✕ {e}</div>
          ))}
        </div>
      )}

      {revisao.avisos.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Avisos (não bloqueiam)</h3>
          {revisao.avisos.map((a, i) => (
            <div key={i} style={warnTextStyle}>⚠ {a}</div>
          ))}
        </div>
      )}

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Comparação com o publicado</h3>
        <DiffView diff={revisao.diff} />
      </div>

      {revisao.efeitos.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Efeitos e modos de automação</h3>
          {revisao.efeitos.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13, marginBottom: 4, opacity: e.habilitado ? 1 : 0.5 }}>
              <span style={{ color: MODO_AUTOMACAO_COR[e.modo], minWidth: 90 }}>{MODO_AUTOMACAO_LABEL[e.modo]}</span>
              <span style={{ fontWeight: 600 }}>{e.rotulo}</span>
              <span style={{ color: "#7d7d8a" }}>{e.motivo}</span>
              {!e.habilitado && <span style={{ color: "#7d7d8a" }}>· desabilitado</span>}
            </div>
          ))}
        </div>
      )}

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Impacto esperado nas instâncias</h3>
        <p style={{ fontSize: 13, color: "#c9c9d1", margin: "0 0 6px" }}>
          <strong>{CATEGORIA_IMPACTO_LABEL[revisao.impacto.categoria] ?? revisao.impacto.categoria}</strong> — {revisao.impacto.motivo}
        </p>
        {revisao.impacto.caminhos.length > 0 && (
          <p style={{ fontSize: 12, color: "#7d7d8a", margin: "0 0 6px", fontFamily: "monospace" }}>
            caminhos: {revisao.impacto.caminhos.slice(0, 12).join(", ")}
            {revisao.impacto.caminhos.length > 12 ? " …" : ""}
          </p>
        )}
        <p style={{ fontSize: 12, color: "#8fd6a0", margin: 0 }}>
          A publicação NÃO altera estado mutável de instância: {revisao.impacto.estadoMutavelPreservado.join("; ")}.
        </p>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Resumo do changelog (obrigatório)</h3>
        <textarea
          data-testid="publicar-resumo"
          value={resumo}
          onChange={(e) => setResumo(e.target.value)}
          rows={3}
          placeholder="Descreva o que mudou nesta publicação — fica registrado no histórico."
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      {errosServidor.length > 0 && (
        <div style={{ ...sectionStyle, borderColor: "#5c2b2b" }}>
          {errosServidor.map((e, i) => (
            <div key={i} style={dangerTextStyle}>✕ {e}</div>
          ))}
        </div>
      )}
      {erro && <p style={dangerTextStyle}>{erro}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 8, marginBottom: 40 }}>
        <button
          data-testid="publicar-confirmar"
          onClick={confirmar}
          disabled={publicando || !revisao.podePublicar || resumo.trim() === ""}
          style={{ ...primaryButtonStyle, opacity: !revisao.podePublicar || resumo.trim() === "" ? 0.5 : 1 }}
          title={!revisao.podePublicar ? "Resolva os erros bloqueantes antes de publicar." : resumo.trim() === "" ? "Escreva o resumo do changelog." : undefined}
        >
          {publicando ? "Publicando..." : revisao.isNovo ? "Publicar (1.0.0)" : `Publicar (${revisao.proximaVersao})`}
        </button>
        <button onClick={() => router.push(`/admin/biblioteca/rascunhos/${revisao.draftId}`)} style={buttonStyle}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
