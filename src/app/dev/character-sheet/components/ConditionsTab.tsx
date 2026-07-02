"use client";

/**
 * Aba "Condições" — checkpoint v0.32. Primeiro módulo mecânico da
 * ficha: condições/efeitos ativos registráveis manualmente, ainda sem
 * automação de modificadores (nenhum bônus/penalidade é aplicado por
 * causa de uma condição estar ativa — isso fica para um checkpoint
 * futuro). `conditionsDisponiveis` (opcional) é a lista de condições
 * publicadas na Biblioteca do Sistema (content_documents,
 * content_type="condition") — usada só para pré-preencher nome/
 * descrição/origem no formulário; a condição continua sendo salva como
 * texto livre no payload do personagem (sem vínculo obrigatório com a
 * Biblioteca).
 */

import { useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import type { ActiveCondition } from "../../../../lib/character";

const inputStyle: React.CSSProperties = {
  background: "#0f1014",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 13,
};

export interface ConditionOption {
  slug: string;
  nome: string;
  descricao_curta?: string;
}

export function ConditionsTab({
  condicoes,
  condicoesDisponiveis,
  onAdd,
  onRemove,
}: {
  condicoes: ActiveCondition[];
  condicoesDisponiveis: ConditionOption[];
  onAdd: (input: { conditionId: string | null; nome: string; descricao: string; origem: string; duracao: string }) => void;
  onRemove: (id: string) => void;
}) {
  const [selecionadaSlug, setSelecionadaSlug] = useState<string>("");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [origem, setOrigem] = useState("");
  const [duracao, setDuracao] = useState("");

  function handleSelecionarBiblioteca(slug: string) {
    setSelecionadaSlug(slug);
    const opcao = condicoesDisponiveis.find((c) => c.slug === slug);
    if (opcao) {
      setNome(opcao.nome);
      setDescricao(opcao.descricao_curta ?? "");
    }
  }

  function handleAdd() {
    const nomeFinal = nome.trim();
    if (!nomeFinal) return;
    onAdd({
      conditionId: selecionadaSlug || null,
      nome: nomeFinal,
      descricao: descricao.trim(),
      origem: origem.trim(),
      duracao: duracao.trim(),
    });
    setSelecionadaSlug("");
    setNome("");
    setDescricao("");
    setOrigem("");
    setDuracao("");
  }

  const ativas = condicoes.filter((c) => c.ativa);
  const removidas = condicoes.filter((c) => !c.ativa);
  const podeAdicionar = nome.trim().length > 0;

  return (
    <Section title="Condições">
      <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 16 }}>
        Registro manual de condições/efeitos ativos — sem automação de bônus/penalidade ainda.
        Adicionar/remover uma condição também registra um evento no log da mesa (aba Mesa).
      </p>

      {/* --- Formulário de adição --- */}
      <div
        style={{
          background: "#15161b",
          border: "1px solid #2a2b33",
          borderRadius: 8,
          padding: 12,
          marginBottom: 20,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {condicoesDisponiveis.length > 0 && (
          <label style={{ fontSize: 12, opacity: 0.7, display: "flex", flexDirection: "column", gap: 4 }}>
            Escolher da Biblioteca (opcional)
            <select
              data-testid="condicao-biblioteca-select"
              value={selecionadaSlug}
              onChange={(e) => handleSelecionarBiblioteca(e.target.value)}
              style={inputStyle}
            >
              <option value="">— condição manual —</option>
              {condicoesDisponiveis.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            data-testid="condicao-nome-input"
            type="text"
            placeholder="Nome da condição"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          />
          <input
            data-testid="condicao-origem-input"
            type="text"
            placeholder="Origem (ex.: ataque do inimigo X)"
            value={origem}
            onChange={(e) => setOrigem(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          />
          <input
            data-testid="condicao-duracao-input"
            type="text"
            placeholder="Duração (ex.: 3 rodadas, cena inteira)"
            value={duracao}
            onChange={(e) => setDuracao(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          />
        </div>
        <textarea
          data-testid="condicao-descricao-input"
          placeholder="Descrição / observações"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />
        <button
          data-testid="condicao-adicionar-button"
          onClick={handleAdd}
          disabled={!podeAdicionar}
          style={{ ...buttonStyle, opacity: podeAdicionar ? 1 : 0.5, cursor: podeAdicionar ? "pointer" : "not-allowed", alignSelf: "flex-start" }}
        >
          Adicionar condição
        </button>
      </div>

      {/* --- Condições ativas --- */}
      <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>Ativas ({ativas.length})</p>
      {ativas.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 20 }}>Nenhuma condição ativa.</p>
      )}
      <div data-testid="condicoes-ativas-lista" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {ativas.map((c) => (
          <div
            key={c.id}
            data-testid="condicao-ativa-item"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              background: "#1d1e24",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              borderLeft: "3px solid #ff6b6b",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span data-testid="condicao-ativa-nome" style={{ fontWeight: 700 }}>
                {c.nome}
              </span>
              <button
                data-testid={`condicao-remover-${c.id}`}
                onClick={() => onRemove(c.id)}
                style={{ ...buttonStyle, padding: "4px 10px", fontSize: 12 }}
              >
                Remover
              </button>
            </div>
            {c.descricao && <span style={{ opacity: 0.8 }}>{c.descricao}</span>}
            <div style={{ display: "flex", gap: 12, fontSize: 11, opacity: 0.6, flexWrap: "wrap" }}>
              {c.origem && <span>Origem: {c.origem}</span>}
              {c.duracao && <span>Duração: {c.duracao}</span>}
              <span>Aplicada em: {new Date(c.aplicadaEm).toLocaleString("pt-BR")}</span>
            </div>
          </div>
        ))}
      </div>

      {/* --- Histórico (removidas) --- */}
      {removidas.length > 0 && (
        <>
          <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>Removidas ({removidas.length})</p>
          <div data-testid="condicoes-removidas-lista" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {removidas.map((c) => (
              <div
                key={c.id}
                data-testid="condicao-removida-item"
                style={{
                  fontSize: 12,
                  opacity: 0.5,
                  background: "#1d1e24",
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                {c.nome} — removida em {c.removidaEm ? new Date(c.removidaEm).toLocaleString("pt-BR") : "?"}
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}
