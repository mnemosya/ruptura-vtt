"use client";

/**
 * Personagens — visão do narrador (aditivo §9.1/§9.2). Todos os
 * personagens da campanha, com busca/filtros/ordenação e as ações
 * administrativas já existentes desde a Fase 1
 * (grant/revokeCharacterControl, archive/restoreCharacter,
 * duplicateCharacter, renameCharacter, createCharacterForCampaign) —
 * nenhuma reimplementada aqui, só reunidas numa área própria (antes
 * viviam soltas dentro da tela monolítica de Mesa).
 *
 * Terminologia (aditivo §13.2): "PN", nunca "PNJ"; "Atribuir jogador"/
 * "Remover controle", nunca "Vincular personagem"/"Perfil".
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  listCharactersForNarratorCampaign,
  listCharacterControllers,
  grantCharacterControl,
  revokeCharacterControl,
  createCharacterForCampaign,
  renameCharacter,
  archiveCharacter,
  restoreCharacter,
  duplicateCharacter,
  type CharacterController,
} from "../../../../lib/character/storage";
import { createInitialCharacter, type CharacterRecord } from "../../../../lib/character";
import { isPersonagemPn, personagemMatchesFiltro, type PersonagemFiltro } from "../../../../lib/character/personagensFilter";
import type { CampaignMember } from "../../../../lib/table";
import { badge, btnDanger, btnGhost, btnPrimary, card, color, emptyState, input, pageContainer, text } from "../_shell/theme";

type Filtro = PersonagemFiltro;
const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "jogadores", label: "Jogadores" },
  { id: "sem_jogador", label: "Sem jogador" },
  { id: "pns", label: "PNs" },
  { id: "arquivados", label: "Arquivados" },
];

type Ordenacao = "atualizado" | "nome";

export default function PersonagensNarradorClient({
  campaignId,
  personagensIniciais,
  controlesIniciais,
  jogadoresAtivos,
}: {
  campaignId: string;
  personagensIniciais: CharacterRecord[];
  controlesIniciais: CharacterController[];
  jogadoresAtivos: CampaignMember[];
}) {
  const [personagens, setPersonagens] = useState(personagensIniciais);
  const [controles, setControles] = useState(controlesIniciais);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("atualizado");
  const [novoNome, setNovoNome] = useState("");
  const [novoPn, setNovoPn] = useState(false);
  const [mostrarCriar, setMostrarCriar] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function fail(err: unknown, msg: string) {
    setError(err instanceof Error ? err.message : msg);
  }

  async function reload() {
    try {
      const [p, c] = await Promise.all([listCharactersForNarratorCampaign(campaignId), listCharacterControllers(campaignId)]);
      setPersonagens(p);
      setControles(c);
    } catch (e) {
      fail(e, "Erro ao recarregar personagens.");
    }
  }

  const controllersByChar = useMemo(() => {
    const map = new Map<string, CharacterController[]>();
    for (const ctrl of controles) {
      const list = map.get(ctrl.character_id) ?? [];
      list.push(ctrl);
      map.set(ctrl.character_id, list);
    }
    return map;
  }, [controles]);

  const contagens = useMemo(() => {
    const counts: Record<Filtro, number> = { todos: 0, jogadores: 0, sem_jogador: 0, pns: 0, arquivados: 0 };
    for (const c of personagens) {
      const n = controllersByChar.get(c.id)?.length ?? 0;
      for (const f of FILTROS) {
        if (personagemMatchesFiltro(c, f.id, n)) counts[f.id]++;
      }
    }
    return counts;
  }, [personagens, controllersByChar]);

  const listaFiltrada = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    let lista = personagens.filter((c) => {
      const n = controllersByChar.get(c.id)?.length ?? 0;
      if (!personagemMatchesFiltro(c, filtro, n)) return false;
      if (buscaLower && !c.name.toLowerCase().includes(buscaLower)) return false;
      return true;
    });
    lista = [...lista].sort((a, b) =>
      ordenacao === "nome" ? a.name.localeCompare(b.name) : b.updated_at.localeCompare(a.updated_at),
    );
    return lista;
  }, [personagens, controllersByChar, filtro, busca, ordenacao]);

  async function criarPersonagem() {
    if (!novoNome.trim()) return;
    setBusy("criar");
    setError(null);
    try {
      const character = createInitialCharacter(null, novoNome.trim());
      if (novoPn) {
        character.metadados = { ...character.metadados, schema_version: character.metadados!.schema_version, tipo_personagem: "pn" };
      }
      await createCharacterForCampaign(campaignId, character);
      setNovoNome("");
      setNovoPn(false);
      await reload();
    } catch (e) {
      fail(e, "Erro ao criar personagem.");
    } finally {
      setBusy(null);
    }
  }

  async function renomear(characterId: string, nomeAtual: string) {
    const novo = window.prompt("Novo nome do personagem:", nomeAtual);
    if (novo == null || !novo.trim() || novo.trim() === nomeAtual) return;
    setBusy(characterId);
    setError(null);
    try {
      await renameCharacter(characterId, novo.trim());
      await reload();
    } catch (e) {
      fail(e, "Erro ao renomear personagem.");
    } finally {
      setBusy(null);
    }
  }

  async function duplicar(characterId: string) {
    setBusy(characterId);
    setError(null);
    try {
      await duplicateCharacter(characterId);
      await reload();
    } catch (e) {
      fail(e, "Erro ao duplicar personagem.");
    } finally {
      setBusy(null);
    }
  }

  async function arquivar(characterId: string) {
    setBusy(characterId);
    setError(null);
    try {
      await archiveCharacter(characterId);
      await reload();
    } catch (e) {
      fail(e, "Erro ao arquivar personagem.");
    } finally {
      setBusy(null);
    }
  }

  async function restaurar(characterId: string) {
    setBusy(characterId);
    setError(null);
    try {
      await restoreCharacter(characterId);
      await reload();
    } catch (e) {
      fail(e, "Erro ao restaurar personagem.");
    } finally {
      setBusy(null);
    }
  }

  async function atribuir(characterId: string, userId: string) {
    if (!userId) return;
    setBusy(characterId);
    setError(null);
    try {
      await grantCharacterControl(characterId, userId);
      await reload();
    } catch (e) {
      fail(e, "Erro ao atribuir jogador.");
    } finally {
      setBusy(null);
    }
  }

  async function removerControle(characterId: string, userId: string) {
    setBusy(characterId);
    setError(null);
    try {
      await revokeCharacterControl(characterId, userId);
      await reload();
    } catch (e) {
      fail(e, "Erro ao remover controle.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main style={pageContainer(1040)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={text.h1}>Personagens</h1>
        <button
          data-testid="personagens-toggle-criar"
          onClick={() => setMostrarCriar((v) => !v)}
          className="rv-btn rv-focusable"
          style={btnPrimary}
        >
          {mostrarCriar ? "Cancelar" : "Criar personagem"}
        </button>
      </div>

      {error && <p role="alert" style={{ color: color.danger, fontSize: 13, marginBottom: 16 }}>Erro: {error}</p>}

      {mostrarCriar && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              data-testid="personagens-novo-nome"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && novoNome.trim()) criarPersonagem(); }}
              placeholder="Nome do novo personagem"
              className="rv-focusable"
              style={{ ...input, flex: 1, minWidth: 200 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={novoPn} onChange={(e) => setNovoPn(e.target.checked)} data-testid="personagens-novo-pn" />
              Marcar como PN
            </label>
            <button
              data-testid="personagens-criar-submit"
              onClick={criarPersonagem}
              disabled={!novoNome.trim() || busy === "criar"}
              className="rv-btn rv-focusable"
              style={{ ...btnPrimary, opacity: !novoNome.trim() || busy === "criar" ? 0.6 : 1 }}
            >
              {busy === "criar" ? "Criando…" : "Criar"}
            </button>
          </div>
          <Link href={`/mesas/${campaignId}/personagens/novo`} className="rv-focusable" style={{ color: color.accent, fontSize: 12 }}>
            Ou usar o assistente de criação completo →
          </Link>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }} htmlFor="personagens-busca">
          Buscar personagem por nome
        </label>
        <input
          id="personagens-busca"
          data-testid="personagens-busca"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome…"
          className="rv-focusable"
          style={{ ...input, minWidth: 220 }}
        />
        <select
          data-testid="personagens-ordenacao"
          value={ordenacao}
          onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
          className="rv-focusable"
          style={input}
          aria-label="Ordenar por"
        >
          <option value="atualizado">Mais recentes primeiro</option>
          <option value="nome">Nome (A–Z)</option>
        </select>
      </div>

      <div role="tablist" aria-label="Filtrar personagens" style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {FILTROS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filtro === f.id}
            data-testid={`personagens-filtro-${f.id}`}
            onClick={() => setFiltro(f.id)}
            className="rv-focusable"
            style={{
              background: filtro === f.id ? "#22314a" : color.surface,
              color: filtro === f.id ? "#cfe6ff" : "inherit",
              border: `1px solid ${filtro === f.id ? "#3a5a8a" : color.border}`,
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {f.label} ({contagens[f.id]})
          </button>
        ))}
      </div>

      {listaFiltrada.length === 0 ? (
        <div style={emptyState} data-testid="personagens-vazio-narrador">
          {personagens.length === 0
            ? "Nenhum personagem nesta campanha ainda. Crie o primeiro acima."
            : "Nenhum personagem corresponde à busca/filtro atual."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="personagens-lista-narrador">
          {listaFiltrada.map((c) => {
            const controladores = controllersByChar.get(c.id) ?? [];
            const jogadoresSemControle = jogadoresAtivos.filter((m) => !controladores.some((ctrl) => ctrl.user_id === m.user_id));
            const arquivado = !!c.archived_at;
            return (
              <div key={c.id} data-testid="personagens-item-narrador" style={{ ...card, display: "flex", flexDirection: "column", gap: 8, opacity: arquivado ? 0.7 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 14 }}>{c.name}</strong>
                    {arquivado && <span style={badge("narrator")}>Arquivado</span>}
                    {!arquivado && isPersonagemPn(c) && <span style={badge("narrator")}>PN</span>}
                    {!arquivado && !isPersonagemPn(c) && controladores.length === 0 && <span style={badge("player")}>Sem jogador</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link
                      href={`/ficha?campaignId=${campaignId}&characterId=${c.id}`}
                      data-testid={`personagens-abrir-ficha-${c.id}`}
                      className="rv-focusable"
                      style={{ background: "#1d1e24", color: "inherit", border: "1px solid #333", borderRadius: 6, padding: "6px 12px", fontSize: 12, textDecoration: "none" }}
                    >
                      Abrir ficha
                    </Link>
                    {!arquivado && (
                      <>
                        <button onClick={() => renomear(c.id, c.name)} disabled={busy === c.id} className="rv-btn rv-focusable" style={btnGhost}>Renomear</button>
                        <button onClick={() => duplicar(c.id)} disabled={busy === c.id} className="rv-btn rv-focusable" style={btnGhost}>Duplicar</button>
                        <button data-testid={`personagens-arquivar-${c.id}`} onClick={() => arquivar(c.id)} disabled={busy === c.id} className="rv-btn rv-focusable" style={btnDanger}>Arquivar</button>
                      </>
                    )}
                    {arquivado && (
                      <button data-testid={`personagens-restaurar-${c.id}`} onClick={() => restaurar(c.id)} disabled={busy === c.id} className="rv-btn rv-focusable" style={btnGhost}>Restaurar</button>
                    )}
                  </div>
                </div>
                {!arquivado && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, opacity: 0.6 }}>
                      {controladores.length === 0 ? "Nenhum jogador atribuído" : `Jogador${controladores.length > 1 ? "es" : ""}: ${controladores.map((ctrl) => ctrl.user_id).join(", ")}`}
                    </span>
                    {controladores.map((ctrl) => (
                      <button
                        key={ctrl.user_id}
                        data-testid={`personagens-remover-controle-${c.id}-${ctrl.user_id}`}
                        onClick={() => removerControle(c.id, ctrl.user_id)}
                        disabled={busy === c.id}
                        className="rv-btn rv-focusable"
                        style={{ ...btnGhost, fontSize: 11 }}
                      >
                        Remover controle de {ctrl.user_id.slice(0, 8)}…
                      </button>
                    ))}
                    {jogadoresSemControle.length > 0 && (
                      <select
                        data-testid={`personagens-atribuir-${c.id}`}
                        defaultValue=""
                        disabled={busy === c.id}
                        onChange={(e) => { if (e.target.value) atribuir(c.id, e.target.value); e.target.value = ""; }}
                        className="rv-focusable"
                        style={{ ...input, fontSize: 11 }}
                        aria-label={`Atribuir jogador a ${c.name}`}
                      >
                        <option value="">— Atribuir jogador —</option>
                        {jogadoresSemControle.map((m) => (
                          <option key={m.user_id} value={m.user_id}>{m.user_id.slice(0, 8)}…</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
