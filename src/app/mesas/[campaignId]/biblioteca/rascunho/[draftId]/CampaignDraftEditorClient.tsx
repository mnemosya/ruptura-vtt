"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OpcoesDeRegras } from "../../../../../../lib/contentSchema/characterRuleOptions";
import type { CamposItem, CamposMagia, CamposRuna, CamposTalento } from "../../../../../../lib/contentSchema/draftTypes";
import { CONTENT_TYPE_REGISTRY } from "../../../../../../lib/contentSchema/contentTypeRegistry";
import type { BaseDocumentoStatus, DraftEfeitosPreservados } from "../../../../../../lib/contentSchema/draftView";
import { CamposComunsSection } from "../../../../../admin/biblioteca/rascunhos/_shared/CamposComunsSection";
import { CamposItemSection } from "../../../../../admin/biblioteca/rascunhos/_shared/CamposItemSection";
import { CamposMagiaSection } from "../../../../../admin/biblioteca/rascunhos/_shared/CamposMagiaSection";
import { CamposRunaSection } from "../../../../../admin/biblioteca/rascunhos/_shared/CamposRunaSection";
import { CamposTalentoSection } from "../../../../../admin/biblioteca/rascunhos/_shared/CamposTalentoSection";
import { EffectsEditorSection } from "../../../../../admin/biblioteca/rascunhos/_shared/EffectsEditorSection";
import { EffectsPreviewList } from "../../../../../admin/biblioteca/rascunhos/_shared/EffectsPreviewList";
import { dangerTextStyle, primaryButtonStyle, sectionStyle, warnTextStyle, buttonStyle } from "../../../../../admin/biblioteca/rascunhos/_shared/formStyles";
import { PreviewPreservado } from "../../../../../admin/biblioteca/rascunhos/_shared/PreviewPreservado";
import type { CampaignContentDraftRow } from "../../../../../../lib/campaignContent";
import { atualizarRascunhoCampanha, excluirRascunhoCampanha, publicarRascunhoCampanha } from "../../../../../../lib/campaignContent/campaignContentServerActions";

type CamposUniao = CamposMagia | CamposItem | CamposRuna | CamposTalento;

const OPERACAO_LABEL: Record<string, string> = {
  novo_homebrew: "Novo homebrew",
  copia_homebrew: "Cópia homebrew",
  novo_override: "Novo override",
  edicao_homebrew: "Edição de homebrew",
  edicao_override: "Edição de override",
  resolucao_atualizacao: "Resolução de atualização oficial",
};

export function CampaignDraftEditorClient({
  campaignId,
  draft,
  efeitosPreservados,
  baseDocumentoStatus,
  opcoes,
  condicoesDisponiveis,
}: {
  campaignId: string;
  draft: CampaignContentDraftRow;
  efeitosPreservados: DraftEfeitosPreservados[];
  baseDocumentoStatus: BaseDocumentoStatus;
  opcoes: OpcoesDeRegras;
  condicoesDisponiveis: { slug: string; nome: string }[];
}) {
  const router = useRouter();
  const [campos, setCampos] = useState<CamposUniao>(draft.payload.camposEditaveis.campos);
  const [version, setVersion] = useState(draft.version);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [conflito, setConflito] = useState(false);
  const [resumo, setResumo] = useState("");
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
    const resultado = await atualizarRascunhoCampanha(draft.id, campos, version);
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

  async function publicar() {
    if (!resumo.trim()) {
      setErros(["Resumo é obrigatório para publicar na campanha."]);
      return;
    }
    setPublicando(true);
    const resultado = await publicarRascunhoCampanha(draft.id, version, resumo);
    setPublicando(false);
    if (resultado.ok) {
      router.push(`/mesas/${campaignId}/biblioteca`);
    } else {
      setErros(resultado.erros ?? (resultado.erro ? [resultado.erro] : []));
      setConflito(resultado.conflito ?? false);
    }
  }

  function cancelar() {
    if (sujo && !window.confirm("Você tem alterações não salvas neste rascunho. Sair sem salvar?")) return;
    router.push(`/mesas/${campaignId}/biblioteca`);
  }

  async function excluirEVoltar() {
    if (!window.confirm(`Excluir o rascunho "${campos.nome || draft.slug}"? Esta ação não pode ser desfeita.`)) return;
    setExcluindo(true);
    const resultado = await excluirRascunhoCampanha(draft.id);
    setExcluindo(false);
    if (resultado.ok) router.push(`/mesas/${campaignId}/biblioteca`);
    else setErros([resultado.erro ?? "Falha ao excluir."]);
  }

  const definicaoTipo = CONTENT_TYPE_REGISTRY[draft.content_type];

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px 64px" }}>
      <p style={{ marginBottom: 16 }}>
        <a href={`/mesas/${campaignId}/biblioteca`} style={{ color: "#5ec8ff", fontSize: 13 }}>
          ← voltar para a Biblioteca da campanha
        </a>
      </p>

      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#7d7d8a", textTransform: "uppercase" }}>{definicaoTipo.label} — conteúdo da campanha</div>
        <h2 style={{ fontSize: 24, margin: "4px 0 8px" }}>{OPERACAO_LABEL[draft.operation] ?? draft.operation}</h2>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#a8a8b3" }}>
          <span>id: {draft.id}</span>
          <span>versão de edição: {version}</span>
          <span>criado em: {new Date(draft.created_at).toLocaleString("pt-BR")}</span>
          {sujo && <span style={{ color: "#e0c56b" }}>● alterações não salvas</span>}
        </div>
        {draft.base_official_document_id && (
          <p style={{ fontSize: 13, color: "#a8a8b3", marginTop: 6 }}>
            Base oficial: <code>{draft.base_official_document_id}</code> (versão {draft.base_official_version ?? "—"}).{" "}
            {baseDocumentoStatus === "mudou" && <span style={warnTextStyle}>O oficial mudou desde a criação deste rascunho — revise antes de publicar.</span>}
            {baseDocumentoStatus === "removido" && <span style={dangerTextStyle}>O conteúdo oficial de origem não foi encontrado.</span>}
          </p>
        )}
      </header>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Identificação</h3>
        <CamposComunsSection
          campos={campos}
          onChange={atualizarCampos}
          slugTravado={draft.operation === "novo_override" || draft.operation === "edicao_override" || draft.operation === "resolucao_atualizacao"}
          onAutoSlug={draft.operation === "novo_homebrew"}
        />
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Classificação e campos específicos</h3>
        {draft.content_type === "spell" && <CamposMagiaSection campos={campos as CamposMagia} onChange={atualizarCampos} />}
        {draft.content_type === "item" && <CamposItemSection campos={campos as CamposItem} onChange={atualizarCampos} />}
        {draft.content_type === "rune" && <CamposRunaSection campos={campos as CamposRuna} onChange={atualizarCampos} />}
        {draft.content_type === "talent" && (
          <CamposTalentoSection campos={campos as CamposTalento} onChange={atualizarCampos} opcoes={opcoes} condicoesDisponiveis={condicoesDisponiveis} />
        )}
      </div>

      {(draft.content_type === "spell" || draft.content_type === "item" || draft.content_type === "rune") && (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Efeitos</h3>
          <EffectsEditorSection
            efeitos={(campos as CamposMagia | CamposItem | CamposRuna).efeitos}
            onChange={(efeitos) => atualizarCampos({ efeitos } as Partial<CamposUniao>)}
            opcoes={opcoes}
            condicoesDisponiveis={condicoesDisponiveis}
            escopoId={draft.content_type}
          />
        </div>
      )}

      {(erros.length > 0 || avisos.length > 0) && (
        <div style={{ ...sectionStyle, borderColor: erros.length > 0 ? "#5a2424" : "#5a4a24", background: erros.length > 0 ? "#241414" : "#241f14" }}>
          {conflito && <p style={{ ...dangerTextStyle, fontWeight: 600 }}>Conflito de edição concorrente — recarregue a página antes de tentar de novo.</p>}
          {erros.map((e, i) => (
            <div key={i} style={dangerTextStyle}>✕ {e}</div>
          ))}
          {avisos.map((a, i) => (
            <div key={i} style={warnTextStyle}>⚠ {a}</div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={salvar} disabled={salvando} style={primaryButtonStyle}>{salvando ? "Salvando..." : "Salvar rascunho"}</button>
        <button onClick={cancelar} style={buttonStyle}>Cancelar</button>
        <button onClick={excluirEVoltar} disabled={excluindo} style={{ ...buttonStyle, marginLeft: "auto", color: "#e08a8a" }}>
          {excluindo ? "Excluindo..." : "Excluir rascunho"}
        </button>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Publicar na campanha</h3>
        <p style={{ fontSize: 12, color: "#7d7d8a", marginBottom: 8 }}>
          Isto publica SOMENTE nesta campanha — nunca no catálogo oficial. Salve o rascunho antes de publicar.
        </p>
        <input
          value={resumo}
          onChange={(e) => setResumo(e.target.value)}
          placeholder="Resumo da mudança (obrigatório)"
          style={{ width: "100%", marginBottom: 8, background: "#111116", color: "#e4e4ea", border: "1px solid #26262e", borderRadius: 6, padding: "6px 8px" }}
        />
        <button onClick={publicar} disabled={publicando} style={primaryButtonStyle}>
          {publicando ? "Publicando..." : "Publicar na campanha"}
        </button>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Preview</h3>
        <p style={{ fontSize: 14 }}>
          <strong>{campos.nome || "(sem nome)"}</strong> — {definicaoTipo.label}
        </p>
        {campos.descricaoCurta && <p style={{ fontSize: 13, color: "#c9c9d1" }}>{campos.descricaoCurta}</p>}
        {draft.content_type === "talent" ? (
          (campos as CamposTalento).niveis.map((nivel, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <h4 style={{ fontSize: 13, color: "#a8a8b3", margin: "8px 0 4px" }}>Nível {nivel.nivel} — {nivel.nomeNivel || "(sem nome)"}</h4>
              <EffectsPreviewList efeitos={nivel.efeitos} />
            </div>
          ))
        ) : (
          <EffectsPreviewList efeitos={(campos as CamposMagia | CamposItem | CamposRuna).efeitos} />
        )}
        <PreviewPreservado resultados={efeitosPreservados} />
      </div>
    </main>
  );
}
