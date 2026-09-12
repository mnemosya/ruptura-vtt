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
import { AbrirFicha } from "../_shell/AbrirFicha";
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
import { getCampaignParticipantInfo, type CampaignParticipantInfo } from "../../../../lib/table/storage";
import type { CampaignMember } from "../../../../lib/table";

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
  participantInfoIniciais,
}: {
  campaignId: string;
  personagensIniciais: CharacterRecord[];
  controlesIniciais: CharacterController[];
  jogadoresAtivos: CampaignMember[];
  /** Nome de exibição + e-mail por user_id (RPC get_campaign_participant_info, migration 0060) — nunca UUID cru na UI. */
  participantInfoIniciais: Record<string, CampaignParticipantInfo>;
}) {
  const [personagens, setPersonagens] = useState(personagensIniciais);
  const [controles, setControles] = useState(controlesIniciais);
  const [participantInfo, setParticipantInfo] = useState<Record<string, CampaignParticipantInfo>>(participantInfoIniciais);
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
      const [p, c, info] = await Promise.all([
        listCharactersForNarratorCampaign(campaignId),
        listCharacterControllers(campaignId),
        getCampaignParticipantInfo(campaignId),
      ]);
      setPersonagens(p);
      setControles(c);
      setParticipantInfo(Object.fromEntries(info));
    } catch (e) {
      fail(e, "Erro ao recarregar personagens.");
    }
  }

  function nomeDe(userId: string): string {
    return participantInfo[userId]?.display_name ?? "Conta sem nome";
  }

  /**
   * user_id de quem tem participação ativa e função Jogador nesta
   * campanha (correção desta revisão) — uma linha em
   * `character_controllers` sozinha NÃO basta para contar em
   * "Jogadores": o narrador dono pode ter uma linha redundante (dados
   * antigos) e um participante removido pode deixar controle residual.
   * `jogadoresAtivos` já vem filtrado (role !== "owner" && status ===
   * "active") do server component.
   */
  const activeJogadorUserIds = useMemo(() => new Set(jogadoresAtivos.map((m) => m.user_id)), [jogadoresAtivos]);

  const controllersByChar = useMemo(() => {
    const map = new Map<string, CharacterController[]>();
    for (const ctrl of controles) {
      const list = map.get(ctrl.character_id) ?? [];
      list.push(ctrl);
      map.set(ctrl.character_id, list);
    }
    return map;
  }, [controles]);

  /** Só controladores com participação ativa e função Jogador — usado nos filtros/contagens (não na lista de "quem controla", que mostra todos por transparência administrativa). */
  const activeJogadorControllerCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [charId, ctrls] of controllersByChar) {
      counts.set(charId, ctrls.filter((c) => activeJogadorUserIds.has(c.user_id)).length);
    }
    return counts;
  }, [controllersByChar, activeJogadorUserIds]);

  const contagens = useMemo(() => {
    const counts: Record<Filtro, number> = { todos: 0, jogadores: 0, sem_jogador: 0, pns: 0, arquivados: 0 };
    for (const c of personagens) {
      const n = activeJogadorControllerCount.get(c.id) ?? 0;
      for (const f of FILTROS) {
        if (personagemMatchesFiltro(c, f.id, n)) counts[f.id]++;
      }
    }
    return counts;
  }, [personagens, activeJogadorControllerCount]);

  const listaFiltrada = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    let lista = personagens.filter((c) => {
      const n = activeJogadorControllerCount.get(c.id) ?? 0;
      if (!personagemMatchesFiltro(c, filtro, n)) return false;
      if (buscaLower && !c.name.toLowerCase().includes(buscaLower)) return false;
      return true;
    });
    lista = [...lista].sort((a, b) =>
      ordenacao === "nome" ? a.name.localeCompare(b.name) : b.updated_at.localeCompare(a.updated_at),
    );
    return lista;
  }, [personagens, activeJogadorControllerCount, filtro, busca, ordenacao]);

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
    <main className="rm-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 className="rm-page-title" style={{ marginBottom: 0 }}>Personagens</h1>
        <button
          data-testid="personagens-toggle-criar"
          onClick={() => setMostrarCriar((v) => !v)}
          className="rm-btn rm-btn-primary rv-focusable"
        >
          {mostrarCriar ? "Cancelar" : "Criar personagem"}
        </button>
      </div>

      {error && <p role="alert" className="rm-erro" style={{ marginBottom: 16 }}>Erro: {error}</p>}

      {mostrarCriar && (
        <div className="rm-card" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              data-testid="personagens-novo-nome"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && novoNome.trim()) criarPersonagem(); }}
              placeholder="Nome do novo personagem"
              className="rm-input rv-focusable"
              style={{ flex: 1, minWidth: 200 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={novoPn} onChange={(e) => setNovoPn(e.target.checked)} data-testid="personagens-novo-pn" />
              Marcar como PN
            </label>
            <button
              data-testid="personagens-criar-submit"
              onClick={criarPersonagem}
              disabled={!novoNome.trim() || busy === "criar"}
              className="rm-btn rm-btn-primary rv-focusable"
            >
              {busy === "criar" ? "Criando…" : "Criar"}
            </button>
          </div>
          <Link href={`/mesas/${campaignId}/personagens/novo`} className="rv-focusable" style={{ color: "var(--cy)", fontSize: 12 }}>
            Ou usar o assistente de criação completo →
          </Link>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label className="rm-sr-only" htmlFor="personagens-busca">
          Buscar personagem por nome
        </label>
        <input
          id="personagens-busca"
          data-testid="personagens-busca"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome…"
          className="rm-input rv-focusable"
          style={{ minWidth: 220 }}
        />
        <select
          data-testid="personagens-ordenacao"
          value={ordenacao}
          onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
          className="rm-select rv-focusable"
          aria-label="Ordenar por"
        >
          <option value="atualizado">Mais recentes primeiro</option>
          <option value="nome">Nome (A–Z)</option>
        </select>
      </div>

      <div role="tablist" aria-label="Filtrar personagens" className="rm-pills" style={{ marginBottom: 20 }}>
        {FILTROS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filtro === f.id}
            data-testid={`personagens-filtro-${f.id}`}
            onClick={() => setFiltro(f.id)}
            className="rm-pill rv-focusable"
          >
            {f.label} ({contagens[f.id]})
          </button>
        ))}
      </div>

      {listaFiltrada.length === 0 ? (
        <div className="rm-empty" data-testid="personagens-vazio-narrador">
          {personagens.length === 0
            ? "Nenhum personagem nesta campanha ainda. Crie o primeiro acima."
            : "Nenhum personagem corresponde à busca/filtro atual."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="personagens-lista-narrador">
          {listaFiltrada.map((c) => {
            const controladores = controllersByChar.get(c.id) ?? [];
            const activeCount = activeJogadorControllerCount.get(c.id) ?? 0;
            const jogadoresSemControle = jogadoresAtivos.filter((m) => !controladores.some((ctrl) => ctrl.user_id === m.user_id));
            const arquivado = !!c.archived_at;
            return (
              <div key={c.id} data-testid="personagens-item-narrador" className="rm-card" style={{ display: "flex", flexDirection: "column", gap: 8, opacity: arquivado ? 0.7 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 14 }}>{c.name}</strong>
                    {arquivado && <span className="rm-badge rm-badge--warn">Arquivado</span>}
                    {!arquivado && isPersonagemPn(c) && <span className="rm-badge rm-badge--warn">PN</span>}
                    {!arquivado && !isPersonagemPn(c) && activeCount === 0 && <span className="rm-badge">Sem jogador</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <AbrirFicha
                      campaignId={campaignId}
                      characterId={c.id}
                      testId={`personagens-abrir-ficha-${c.id}`}
                      className="rm-btn rm-btn-primary rv-focusable"
                    >
                      Abrir ficha
                    </AbrirFicha>
                    {!arquivado && (
                      <>
                        <button onClick={() => renomear(c.id, c.name)} disabled={busy === c.id} className="rm-btn rm-btn-ghost rv-focusable">Renomear</button>
                        <button onClick={() => duplicar(c.id)} disabled={busy === c.id} className="rm-btn rm-btn-ghost rv-focusable">Duplicar</button>
                        <button data-testid={`personagens-arquivar-${c.id}`} onClick={() => arquivar(c.id)} disabled={busy === c.id} className="rm-btn rm-btn-danger rv-focusable">Arquivar</button>
                      </>
                    )}
                    {arquivado && (
                      <button data-testid={`personagens-restaurar-${c.id}`} onClick={() => restaurar(c.id)} disabled={busy === c.id} className="rm-btn rm-btn-ghost rv-focusable">Restaurar</button>
                    )}
                  </div>
                </div>
                {!arquivado && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="rm-faint">
                      {controladores.length === 0 ? "Nenhum jogador atribuído" : `Jogador${controladores.length > 1 ? "es" : ""}: ${controladores.map((ctrl) => nomeDe(ctrl.user_id)).join(", ")}`}
                    </span>
                    {controladores.map((ctrl) => (
                      <button
                        key={ctrl.user_id}
                        data-testid={`personagens-remover-controle-${c.id}-${ctrl.user_id}`}
                        onClick={() => removerControle(c.id, ctrl.user_id)}
                        disabled={busy === c.id}
                        className="rm-btn rm-btn-ghost rv-focusable"
                        style={{ fontSize: 11, padding: "5px 10px" }}
                      >
                        Remover controle de {nomeDe(ctrl.user_id)}
                      </button>
                    ))}
                    {jogadoresSemControle.length > 0 && (
                      <select
                        data-testid={`personagens-atribuir-${c.id}`}
                        defaultValue=""
                        disabled={busy === c.id}
                        onChange={(e) => { if (e.target.value) atribuir(c.id, e.target.value); e.target.value = ""; }}
                        className="rm-select rv-focusable"
                        style={{ fontSize: 11 }}
                        aria-label={`Atribuir jogador a ${c.name}`}
                      >
                        <option value="">— Atribuir jogador —</option>
                        {jogadoresSemControle.map((m) => (
                          <option key={m.user_id} value={m.user_id}>{nomeDe(m.user_id)}</option>
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
