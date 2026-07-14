"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CamposItem, CamposMagia, CamposTalento, ContentDraftRow } from "../../../../../lib/contentSchema/draftTypes";
import { CONTENT_TYPE_REGISTRY } from "../../../../../lib/contentSchema/contentTypeRegistry";
import { atualizarRascunho, excluirRascunho } from "../../../../../lib/contentSchema/draftServerActions";
import type { BaseDocumentoStatus, DraftEfeitosPreservados } from "../../../../../lib/contentSchema/draftView";
import { CamposComunsSection } from "../_shared/CamposComunsSection";
import { CamposItemSection } from "../_shared/CamposItemSection";
import { CamposMagiaSection } from "../_shared/CamposMagiaSection";
import { CamposTalentoSection } from "../_shared/CamposTalentoSection";
import { dangerTextStyle, primaryButtonStyle, sectionStyle, warnTextStyle, buttonStyle } from "../_shared/formStyles";
import { PreviewPreservado } from "../_shared/PreviewPreservado";

type CamposUniao = CamposMagia | CamposItem | CamposTalento;

export function DraftEditorClient({
  draft,
  efeitosPreservados,
  baseDocumentoStatus,
}: {
  draft: ContentDraftRow;
  efeitosPreservados: DraftEfeitosPreservados[];
  baseDocumentoStatus: BaseDocumentoStatus;
}) {
  const router = useRouter();
  const [campos, setCampos] = useState<CamposUniao>(draft.payload.camposEditaveis.campos);
  const [version, setVersion] = useState(draft.version);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [conflito, setConflito] = useState(false);
  const camposIniciaisRef = useRef(draft.payload.camposEditaveis.campos);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (sujo) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [sujo]);

  function atualizarCampos(novos: Partial<CamposUniao>) {
    setCampos((atual) => ({ ...atual, ...novos }) as CamposUniao);
    setSujo(true);
    setConflito(false);
  }

  async function salvar() {
    setSalvando(true);
    setConflito(false);
    const resultado = await atualizarRascunho(draft.id, campos, version);
    setSalvando(false);
    if (resultado.ok) {
      setErros([]);
      setAvisos(resultado.avisos ?? []);
      if (resultado.novaVersao) setVersion(resultado.novaVersao);
      setSujo(false);
      camposIniciaisRef.current = campos;
      router.refresh();
    } else {
      setErros(resultado.erros ?? (resultado.erro ? [resultado.erro] : []));
      setAvisos(resultado.avisos ?? []);
      setConflito(resultado.conflito ?? false);
    }
  }

  function cancelar() {
    if (sujo && !window.confirm("Você tem alterações não salvas neste rascunho. Sair sem salvar?")) return;
    router.push("/admin/biblioteca/rascunhos");
  }

  async function excluirEVoltar() {
    if (!window.confirm(`Excluir o rascunho "${campos.nome || draft.slug}"? Esta ação não pode ser desfeita.`)) return;
    setExcluindo(true);
    const resultado = await excluirRascunho(draft.id);
    setExcluindo(false);
    if (resultado.ok) router.push("/admin/biblioteca/rascunhos");
    else setErros([resultado.erro ?? "Falha ao excluir."]);
  }

  const definicaoTipo = CONTENT_TYPE_REGISTRY[draft.content_type];

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <a href="/admin/biblioteca/rascunhos" style={{ color: "#8fd6a0", fontSize: 13 }}>
          ← voltar para rascunhos
        </a>
      </p>

      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#7d7d8a", textTransform: "uppercase" }}>{definicaoTipo.label} — tipo não pode ser alterado</div>
        <h2 style={{ fontSize: 24, margin: "4px 0 8px" }}>
          Rascunho — não disponível no jogo
        </h2>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#a8a8b3" }}>
          <span>id: {draft.id}</span>
          <span>versão de edição: {version}</span>
          <span>criado em: {new Date(draft.created_at).toLocaleString("pt-BR")}</span>
          {sujo && <span style={{ color: "#e0c56b" }}>● alterações não salvas</span>}
        </div>
        {draft.base_document_id && (
          <p style={{ fontSize: 13, color: "#a8a8b3", marginTop: 6 }}>
            Origem: conteúdo publicado <code>{draft.base_document_id}</code>.{" "}
            {baseDocumentoStatus === "mudou" && (
              <span style={warnTextStyle}>O conteúdo publicado mudou desde a criação deste rascunho (aviso — sem merge automático).</span>
            )}
            {baseDocumentoStatus === "removido" && <span style={dangerTextStyle}>O conteúdo publicado de origem não foi encontrado.</span>}
          </p>
        )}
        {draft.duplicated_from && <p style={{ fontSize: 13, color: "#a8a8b3", marginTop: 6 }}>Duplicado de: <code>{draft.duplicated_from}</code></p>}
      </header>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Identificação</h3>
        <CamposComunsSection campos={campos} onChange={atualizarCampos} slugTravado={Boolean(draft.base_document_id)} onAutoSlug={!draft.base_document_id} />
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Classificação e campos específicos</h3>
        {draft.content_type === "spell" && <CamposMagiaSection campos={campos as CamposMagia} onChange={atualizarCampos} />}
        {draft.content_type === "item" && <CamposItemSection campos={campos as CamposItem} onChange={atualizarCampos} />}
        {draft.content_type === "talent" && <CamposTalentoSection campos={campos as CamposTalento} onChange={atualizarCampos} />}
      </div>

      {(erros.length > 0 || avisos.length > 0) && (
        <div style={{ ...sectionStyle, borderColor: erros.length > 0 ? "#5a2424" : "#5a4a24", background: erros.length > 0 ? "#241414" : "#241f14" }}>
          {conflito && <p style={{ ...dangerTextStyle, fontWeight: 600 }}>Conflito de edição concorrente — recarregue a página antes de tentar de novo.</p>}
          {erros.map((e, i) => (
            <div key={i} style={dangerTextStyle}>
              ✕ {e}
            </div>
          ))}
          {avisos.map((a, i) => (
            <div key={i} style={warnTextStyle}>
              ⚠ {a}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <button onClick={salvar} disabled={salvando} style={primaryButtonStyle}>
          {salvando ? "Salvando..." : "Salvar rascunho"}
        </button>
        <button onClick={cancelar} style={buttonStyle}>
          Cancelar
        </button>
        <button onClick={excluirEVoltar} disabled={excluindo} style={{ ...buttonStyle, marginLeft: "auto", color: "#e08a8a" }}>
          {excluindo ? "Excluindo..." : "Excluir rascunho"}
        </button>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Preview</h3>
        <p style={{ fontSize: 13, color: "#e0c56b" }}>Rascunho — não disponível no jogo até publicação (publicação ainda não implementada).</p>
        <p style={{ fontSize: 14 }}>
          <strong>{campos.nome || "(sem nome)"}</strong> — {definicaoTipo.label}
          {campos.categoria ? ` — ${campos.categoria}` : ""}
        </p>
        {campos.descricaoCurta && <p style={{ fontSize: 13, color: "#c9c9d1" }}>{campos.descricaoCurta}</p>}
        <PreviewPreservado resultados={efeitosPreservados} />
      </div>
    </div>
  );
}
