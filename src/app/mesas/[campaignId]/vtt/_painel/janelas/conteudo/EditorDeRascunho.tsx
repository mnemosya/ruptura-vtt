"use client";

/**
 * Editor de rascunho de conteúdo DA CAMPANHA.
 *
 * Escopo de estilo na Fase 5, decisão deliberada: as SEÇÕES DE
 * FORMULÁRIO (`CamposComunsSection`, `EffectsEditorSection`, etc.) e o
 * `formStyles` que elas usam vêm de
 * `src/app/admin/biblioteca/rascunhos/_shared/` — compartilhados com a
 * Biblioteca do Sistema (/admin), área FORA desta reestrutura.
 * Restilizá-los mudaria /admin junto; duplicá-los para a campanha criaria
 * duas cópias do mesmo formulário complexo para manter em sincronia.
 * Nenhuma das duas se paga aqui. Migrado então só o que ESTE arquivo
 * possui — container, cabeçalho, avisos, botões e o campo de resumo —,
 * deixando as seções compartilhadas com a aparência de /admin. É a
 * mesma régua do critério de limpeza da Fase 6 ("não é uma regra de
 * zero `style=` sob pena de falha").
 */

import { useEffect, useRef, useState } from "react";
import type { OpcoesDeRegras } from "../../../../../../../lib/contentSchema/characterRuleOptions";
import type { CamposItem, CamposMagia, CamposRuna, CamposTalento } from "../../../../../../../lib/contentSchema/draftTypes";
import { CONTENT_TYPE_REGISTRY } from "../../../../../../../lib/contentSchema/contentTypeRegistry";
import type { BaseDocumentoStatus, DraftEfeitosPreservados } from "../../../../../../../lib/contentSchema/draftView";
import { CamposComunsSection } from "../../../../../../admin/biblioteca/rascunhos/_shared/CamposComunsSection";
import { CamposItemSection } from "../../../../../../admin/biblioteca/rascunhos/_shared/CamposItemSection";
import { CamposMagiaSection } from "../../../../../../admin/biblioteca/rascunhos/_shared/CamposMagiaSection";
import { CamposRunaSection } from "../../../../../../admin/biblioteca/rascunhos/_shared/CamposRunaSection";
import { CamposTalentoSection } from "../../../../../../admin/biblioteca/rascunhos/_shared/CamposTalentoSection";
import { EffectsEditorSection } from "../../../../../../admin/biblioteca/rascunhos/_shared/EffectsEditorSection";
import { EffectsPreviewList } from "../../../../../../admin/biblioteca/rascunhos/_shared/EffectsPreviewList";
import { PreviewPreservado } from "../../../../../../admin/biblioteca/rascunhos/_shared/PreviewPreservado";
import type { CampaignContentDraftRow } from "../../../../../../../lib/campaignContent";
import { atualizarRascunhoCampanha, excluirRascunhoCampanha, publicarRascunhoCampanha } from "../../../../../../../lib/campaignContent/campaignContentServerActions";

type CamposUniao = CamposMagia | CamposItem | CamposRuna | CamposTalento;

const OPERACAO_LABEL: Record<string, string> = {
  novo_homebrew: "Novo homebrew",
  copia_homebrew: "Cópia homebrew",
  novo_override: "Novo override",
  edicao_homebrew: "Edição de homebrew",
  edicao_override: "Edição de override",
  resolucao_atualizacao: "Resolução de atualização oficial",
};

export function EditorDeRascunho({
  campaignId,
  draft,
  efeitosPreservados,
  baseDocumentoStatus,
  opcoes,
  condicoesDisponiveis,
  onVoltar,
  onRecarregar,
}: {
  campaignId: string;
  draft: CampaignContentDraftRow;
  efeitosPreservados: DraftEfeitosPreservados[];
  baseDocumentoStatus: BaseDocumentoStatus;
  opcoes: OpcoesDeRegras;
  condicoesDisponiveis: { slug: string; nome: string }[];
  /** Publicar, excluir ou desistir devolve à lista — sem navegar. */
  onVoltar: () => void;
  onRecarregar: () => Promise<void> | void;
}) {
  // "capitulo" (Etapa 11, correção do drag) nunca é um content_type de
  // homebrew de campanha — a UI de criação (`/mesas/[campaignId]/biblioteca`)
  // nunca oferece essa opção (é um conceito editorial da Biblioteca do
  // Sistema, não de mesa). O cast documenta essa garantia sem reabrir a
  // Etapa 12: `CamposEditaveis` só ficou mais larga por ser compartilhada.
  const [campos, setCampos] = useState<CamposUniao>(draft.payload.camposEditaveis.campos as CamposUniao);
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
      void onRecarregar();
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
      onVoltar();
    } else {
      setErros(resultado.erros ?? (resultado.erro ? [resultado.erro] : []));
      setConflito(resultado.conflito ?? false);
    }
  }

  function cancelar() {
    if (sujo && !window.confirm("Você tem alterações não salvas neste rascunho. Sair sem salvar?")) return;
    onVoltar();
  }

  async function excluirEVoltar() {
    if (!window.confirm(`Excluir o rascunho "${campos.nome || draft.slug}"? Esta ação não pode ser desfeita.`)) return;
    setExcluindo(true);
    const resultado = await excluirRascunhoCampanha(draft.id);
    setExcluindo(false);
    if (resultado.ok) onVoltar();
    else setErros([resultado.erro ?? "Falha ao excluir."]);
  }

  const definicaoTipo = CONTENT_TYPE_REGISTRY[draft.content_type];

  return (
    <main className="rm-page">
      {/* Voltar é ESTADO, não rota: a lista está atrás desta vista, na
          mesma janela. */}
      <p style={{ marginBottom: 16 }}>
        <button type="button" className="rv-conteudo-link" onClick={onVoltar}>
          ← Conteúdo da campanha
        </button>
      </p>

      <header style={{ marginBottom: 16 }}>
        <div className="rm-section-title">{definicaoTipo.label} — conteúdo da campanha</div>
        <h1 className="rm-page-title" style={{ marginBottom: 8 }}>{OPERACAO_LABEL[draft.operation] ?? draft.operation}</h1>
        <div className="rm-faint" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span>id: {draft.id}</span>
          <span>versão de edição: {version}</span>
          <span>criado em: {new Date(draft.created_at).toLocaleString("pt-BR")}</span>
          {sujo && <span className="rm-badge rm-badge--warn" data-testid="rascunho-sujo">alterações não salvas</span>}
        </div>
        {draft.base_official_document_id && (
          <p className="rm-faint" style={{ marginTop: 6 }}>
            Base oficial: <code className="rm-code">{draft.base_official_document_id}</code> (versão {draft.base_official_version ?? "—"}).{" "}
            {baseDocumentoStatus === "mudou" && <span style={{ color: "var(--am)" }}>O oficial mudou desde a criação deste rascunho — revise antes de publicar.</span>}
            {baseDocumentoStatus === "removido" && <span style={{ color: "var(--rm-danger)" }}>O conteúdo oficial de origem não foi encontrado.</span>}
          </p>
        )}
      </header>

      <div className="rm-card" style={{ marginBottom: 16 }}>
        <h3 className="rm-section-title">Identificação</h3>
        <CamposComunsSection
          campos={campos}
          onChange={atualizarCampos}
          slugTravado={draft.operation === "novo_override" || draft.operation === "edicao_override" || draft.operation === "resolucao_atualizacao"}
          onAutoSlug={draft.operation === "novo_homebrew"}
        />
      </div>

      <div className="rm-card" style={{ marginBottom: 16 }}>
        <h3 className="rm-section-title">Classificação e campos específicos</h3>
        {draft.content_type === "spell" && <CamposMagiaSection campos={campos as CamposMagia} onChange={atualizarCampos} />}
        {draft.content_type === "item" && <CamposItemSection campos={campos as CamposItem} onChange={atualizarCampos} />}
        {draft.content_type === "rune" && <CamposRunaSection campos={campos as CamposRuna} onChange={atualizarCampos} />}
        {draft.content_type === "talent" && (
          <CamposTalentoSection campos={campos as CamposTalento} onChange={atualizarCampos} opcoes={opcoes} condicoesDisponiveis={condicoesDisponiveis} />
        )}
      </div>

      {(draft.content_type === "spell" || draft.content_type === "item" || draft.content_type === "rune") && (
        <div className="rm-card" style={{ marginBottom: 16 }}>
          <h3 className="rm-section-title">Efeitos</h3>
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
        <div className={`rm-note ${erros.length > 0 ? "rm-note--danger" : "rm-note--warn"}`} role="alert" style={{ marginBottom: 16 }}>
          {conflito && <p style={{ fontWeight: 600, margin: "0 0 4px" }}>Conflito de edição concorrente — recarregue a página antes de tentar de novo.</p>}
          {erros.map((e, i) => (
            <div key={i}>✕ {e}</div>
          ))}
          {avisos.map((a, i) => (
            <div key={i}>⚠ {a}</div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={salvar} disabled={salvando} className="rm-btn rm-btn-primary rv-focusable">{salvando ? "Salvando..." : "Salvar rascunho"}</button>
        <button onClick={cancelar} className="rm-btn rm-btn-ghost rv-focusable">Cancelar</button>
        <button onClick={excluirEVoltar} disabled={excluindo} className="rm-btn rm-btn-danger rv-focusable" style={{ marginLeft: "auto" }}>
          {excluindo ? "Excluindo..." : "Excluir rascunho"}
        </button>
      </div>

      <div className="rm-card" style={{ marginBottom: 16 }}>
        <h3 className="rm-section-title">Publicar na campanha</h3>
        <p className="rm-faint" style={{ marginBottom: 8 }}>
          Isto publica SOMENTE nesta campanha — nunca no catálogo oficial. Salve o rascunho antes de publicar.
        </p>
        <input
          value={resumo}
          onChange={(e) => setResumo(e.target.value)}
          placeholder="Resumo da mudança (obrigatório)"
          aria-label="Resumo da mudança"
          className="rm-input rv-focusable"
          style={{ width: "100%", marginBottom: 8 }}
        />
        <button onClick={publicar} disabled={publicando} className="rm-btn rm-btn-primary rv-focusable">
          {publicando ? "Publicando..." : "Publicar na campanha"}
        </button>
      </div>

      <div className="rm-card">
        <h3 className="rm-section-title">Preview</h3>
        <p style={{ fontSize: 14, margin: "0 0 4px" }}>
          <strong>{campos.nome || "(sem nome)"}</strong> — {definicaoTipo.label}
        </p>
        {campos.descricaoCurta && <p className="rm-faint">{campos.descricaoCurta}</p>}
        {draft.content_type === "talent" ? (
          (campos as CamposTalento).niveis.map((nivel, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <h4 className="rm-faint" style={{ margin: "8px 0 4px" }}>Nível {nivel.nivel} — {nivel.nomeNivel || "(sem nome)"}</h4>
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
