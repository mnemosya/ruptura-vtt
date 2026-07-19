"use client";

import { useState } from "react";
import { diagnosticarEfeitoEditavel } from "../../../../../lib/contentSchema/effectDiagnostics";
import { getEfeitoTipoDefinition } from "../../../../../lib/contentSchema/effectTypeRegistry";
import { novoEfeitoEditavel, TIPOS_EFEITO_MVP, type EfeitoEditavel, type TipoEfeitoMvp } from "../../../../../lib/contentSchema/effectDraftTypes";
import type { OpcoesDeRegras } from "../../../../../lib/contentSchema/characterRuleOptions";
import { buttonStyle, inputStyle, labelStyle, sectionStyle } from "./formStyles";
import { DuracaoEditor } from "./DuracaoEditor";
import { EfeitoCamposPorTipo } from "./EfeitoCamposPorTipo";
import { MODO_AUTOMACAO_COR, MODO_AUTOMACAO_LABEL, MODO_AUTOMACAO_SIMBOLO } from "../../labels";
import { GATILHOS_INICIAIS, ALVOS_INICIAIS } from "../../../../../lib/contentSchema/effectDraftTypes";

const LABEL_TIPO: Record<TipoEfeitoMvp, string> = {
  dano: "Dano",
  cura: "Cura",
  aplicar_condicao: "Aplicar condição",
  remover_condicao: "Remover condição",
  modificar_teste: "Modificar teste",
  alterar_recurso: "Alterar recurso",
};

function renormalizarOrdem(efeitos: EfeitoEditavel[]): EfeitoEditavel[] {
  return efeitos.map((e, indice) => ({ ...e, ordem: indice }));
}

function gerarIdCopia(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `efeito-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * `escopoId` identifica de forma estável QUAL instância desta seção está
 * em jogo (ex.: "magia", "item", "nivel-1", "nivel-2", "nivel-3" — o
 * número do nível já é um identificador semântico real, nunca um índice
 * de renderização). Usado só para nomear os controles de "adicionar
 * efeito" desta instância (`data-testid` estável) — nunca lido pela
 * lógica de negócio.
 */
export function EffectsEditorSection({
  efeitos,
  onChange,
  opcoes,
  condicoesDisponiveis,
  escopoId,
}: {
  efeitos: EfeitoEditavel[];
  onChange: (efeitos: EfeitoEditavel[]) => void;
  opcoes: OpcoesDeRegras;
  condicoesDisponiveis: { slug: string; nome: string }[];
  escopoId: string;
}) {
  const [tipoParaAdicionar, setTipoParaAdicionar] = useState<TipoEfeitoMvp>("dano");

  function adicionar() {
    onChange(renormalizarOrdem([...efeitos, novoEfeitoEditavel(tipoParaAdicionar, efeitos.length)]));
  }

  function atualizar(id: string, patch: Partial<EfeitoEditavel>) {
    onChange(efeitos.map((e) => (e.id === id ? ({ ...e, ...patch } as EfeitoEditavel) : e)));
  }

  function atualizarCampos(id: string, patchCampos: Record<string, unknown>) {
    onChange(efeitos.map((e) => (e.id === id ? ({ ...e, campos: { ...e.campos, ...patchCampos } } as EfeitoEditavel) : e)));
  }

  function remover(id: string) {
    if (!window.confirm("Remover este efeito do rascunho?")) return;
    onChange(renormalizarOrdem(efeitos.filter((e) => e.id !== id)));
  }

  function duplicar(id: string) {
    const indice = efeitos.findIndex((e) => e.id === id);
    if (indice === -1) return;
    const copia: EfeitoEditavel = { ...efeitos[indice], id: gerarIdCopia(), nomeOpcional: efeitos[indice].nomeOpcional ? `${efeitos[indice].nomeOpcional} (cópia)` : undefined };
    const novos = [...efeitos.slice(0, indice + 1), copia, ...efeitos.slice(indice + 1)];
    onChange(renormalizarOrdem(novos));
  }

  function mover(id: string, direcao: -1 | 1) {
    const indice = efeitos.findIndex((e) => e.id === id);
    const alvo = indice + direcao;
    if (indice === -1 || alvo < 0 || alvo >= efeitos.length) return;
    const novos = [...efeitos];
    [novos[indice], novos[alvo]] = [novos[alvo], novos[indice]];
    onChange(renormalizarOrdem(novos));
  }

  const ordenados = [...efeitos].sort((a, b) => a.ordem - b.ordem);

  return (
    <div data-testid={`efeitos-secao-${escopoId}`}>
      {ordenados.length === 0 && (
        <p data-testid={`efeitos-vazio-${escopoId}`} style={{ color: "#7d7d8a", fontSize: 13 }}>
          Nenhum efeito configurado ainda.
        </p>
      )}

      {ordenados.map((efeito, indice) => {
        const diagnostico = diagnosticarEfeitoEditavel(efeito);
        const definicao = getEfeitoTipoDefinition(efeito.tipo);
        return (
          <div
            key={efeito.id}
            data-testid="efeito-editor-card"
            data-effect-id={efeito.id}
            data-effect-type={efeito.tipo}
            style={{ ...sectionStyle, opacity: efeito.habilitado ? 1 : 0.55 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong data-testid="efeito-titulo">
                {LABEL_TIPO[efeito.tipo]}
                {efeito.nomeOpcional ? ` — ${efeito.nomeOpcional}` : ""}
              </strong>
              <span data-testid="efeito-modo-automacao" data-modo={diagnostico.modoAutomacao} style={{ color: MODO_AUTOMACAO_COR[diagnostico.modoAutomacao], fontSize: 13 }}>
                {MODO_AUTOMACAO_SIMBOLO[diagnostico.modoAutomacao]} {MODO_AUTOMACAO_LABEL[diagnostico.modoAutomacao]}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <button type="button" data-testid="efeito-mover-cima" onClick={() => mover(efeito.id, -1)} disabled={indice === 0} style={buttonStyle}>
                ↑ mover para cima
              </button>
              <button
                type="button"
                data-testid="efeito-mover-baixo"
                onClick={() => mover(efeito.id, 1)}
                disabled={indice === ordenados.length - 1}
                style={buttonStyle}
              >
                ↓ mover para baixo
              </button>
              <button type="button" data-testid="efeito-toggle-habilitado" onClick={() => atualizar(efeito.id, { habilitado: !efeito.habilitado })} style={buttonStyle}>
                {efeito.habilitado ? "Desabilitar" : "Habilitar"}
              </button>
              <button type="button" data-testid="efeito-duplicar" onClick={() => duplicar(efeito.id)} style={buttonStyle}>
                Duplicar
              </button>
              <button type="button" data-testid="efeito-remover" onClick={() => remover(efeito.id)} style={{ ...buttonStyle, color: "#e08a8a" }}>
                Remover
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
              <label style={labelStyle}>
                Nome opcional
                <input
                  data-testid="efeito-nome-opcional"
                  value={efeito.nomeOpcional ?? ""}
                  onChange={(e) => atualizar(efeito.id, { nomeOpcional: e.target.value || undefined })}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Gatilho *
                <select
                  data-testid="efeito-gatilho"
                  value={efeito.gatilho ?? ""}
                  onChange={(e) => atualizar(efeito.id, { gatilho: e.target.value || undefined })}
                  style={inputStyle}
                >
                  <option value="">—</option>
                  {GATILHOS_INICIAIS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Alvo *
                <select data-testid="efeito-alvo" value={efeito.alvo ?? ""} onChange={(e) => atualizar(efeito.id, { alvo: e.target.value || undefined })} style={inputStyle}>
                  <option value="">—</option>
                  {ALVOS_INICIAIS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <DuracaoEditor duracao={efeito.duracao} onChange={(duracao) => atualizar(efeito.id, { duracao })} />
            </div>

            <EfeitoCamposPorTipo efeito={efeito} onChangeCampos={(patch) => atualizarCampos(efeito.id, patch)} opcoes={opcoes} condicoesDisponiveis={condicoesDisponiveis} />

            <label style={{ ...labelStyle, marginTop: 10 }}>
              Texto de log
              <input data-testid="efeito-texto-log" value={efeito.textoLog ?? ""} onChange={(e) => atualizar(efeito.id, { textoLog: e.target.value || undefined })} style={inputStyle} />
            </label>

            <p style={{ fontSize: 12, color: "#7d7d8a", fontStyle: "italic", marginTop: 8 }}>{diagnostico.motivo}</p>
            {diagnostico.executor && <p style={{ fontSize: 12, color: "#5f6070", marginTop: 2 }}>Executor: {diagnostico.executor}</p>}
            {!diagnostico.executor && definicao.executor.modulo && <p style={{ fontSize: 12, color: "#5f6070", marginTop: 2 }}>Executor conhecido: {definicao.executor.modulo}</p>}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <label style={labelStyle}>
          Adicionar efeito
          <select
            data-testid={`novo-efeito-tipo-${escopoId}`}
            value={tipoParaAdicionar}
            onChange={(e) => setTipoParaAdicionar(e.target.value as TipoEfeitoMvp)}
            style={inputStyle}
          >
            {TIPOS_EFEITO_MVP.map((t) => (
              <option key={t} value={t}>
                {LABEL_TIPO[t]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" data-testid={`novo-efeito-adicionar-${escopoId}`} onClick={adicionar} style={buttonStyle}>
          + Adicionar
        </button>
      </div>
    </div>
  );
}
