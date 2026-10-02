"use client";

/**
 * AVANÇO DE RANKING (RUPTURA v1.2) — o Modo Evolução orientado pelo
 * próximo Ranking (capítulo 25).
 *
 * Mostra o que o próximo Ranking concede e pede só as escolhas que ele
 * exige: Subclasse (E), pontos de Perícia, ponto de Atributo e ponto de
 * Vertente. O servidor recarrega o personagem e a Classe, valida e grava;
 * a ficha recebe o resultado pelo realtime. Magias concedidas pelo avanço
 * ficam registradas como pendentes até o catálogo v1.2 existir.
 */

import { useEffect, useMemo, useState } from "react";
import { AuxJanela } from "./AuxModals";
import {
  avancarRankingV12Action,
  lerAvancoV12Action,
  type PacoteAvancoV12,
} from "../../../mesas/[campaignId]/vtt/_acoes/evolucaoV12Actions";

const ATRIBUTOS = [
  { id: "corpo", nome: "Corpo" },
  { id: "mente", nome: "Mente" },
  { id: "animo", nome: "Ânimo" },
] as const;

const VERTENTES: Array<{ id: string; nome: string }> = [
  { id: "biotica", nome: "Biótica" },
  { id: "cinetica", nome: "Cinética" },
  { id: "cognitiva", nome: "Cognitiva" },
  { id: "energetica", nome: "Energética" },
  { id: "material", nome: "Material" },
  { id: "sinaptica", nome: "Sináptica" },
];

export function AvancoRankingModal({
  campaignId,
  characterId,
  onFechar,
}: {
  campaignId: string;
  characterId: string;
  onFechar: () => void;
}) {
  const [pacote, setPacote] = useState<PacoteAvancoV12 | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState<string | null>(null);

  const [subclasse, setSubclasse] = useState<string>("");
  const [pericias, setPericias] = useState<Record<string, number>>({});
  const [atributo, setAtributo] = useState<string>("");
  const [vertente, setVertente] = useState<string>("");
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void lerAvancoV12Action(campaignId, characterId).then((r) => {
      if (!vivo) return;
      if (!r.ok) setErro(r.erro ?? "Falha ao ler o avanço.");
      else setPacote(r.dados ?? null);
    });
    return () => {
      vivo = false;
    };
  }, [campaignId, characterId]);

  const gastos = useMemo(() => Object.values(pericias).reduce((s, n) => s + n, 0), [pericias]);

  const pendencias = useMemo(() => {
    if (!pacote) return [];
    const p: string[] = [];
    const { avanco } = pacote;
    if (avanco.escolhe_subclasse && !subclasse) p.push("Escolha uma Subclasse.");
    if (gastos !== avanco.pontos_pericia) p.push(`Distribua ${avanco.pontos_pericia} ponto(s) de Perícia (${gastos} usado(s)).`);
    if (avanco.pontos_atributo > 0 && !atributo) p.push("Escolha o Atributo que recebe +1.");
    if (avanco.pontos_vertente > 0 && !vertente) p.push("Escolha a Vertente que recebe +1.");
    return p;
  }, [pacote, subclasse, gastos, atributo, vertente]);

  async function confirmar() {
    if (!pacote) return;
    setEnviando(true);
    setErro(null);
    const r = await avancarRankingV12Action(campaignId, characterId, {
      ...(pacote.avanco.escolhe_subclasse ? { subclasse_id: subclasse } : {}),
      ...(gastos > 0 ? { pericias } : {}),
      ...(atributo ? { atributo: atributo as "corpo" | "mente" | "animo" } : {}),
      ...(vertente ? { vertente } : {}),
    });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro ?? "Falha ao avançar.");
      return;
    }
    setConcluido(r.dados?.ranking ?? pacote.para);
  }

  if (concluido) {
    return (
      <AuxJanela titulo="Ranking alcançado" onFechar={onFechar}>
        <p className="rc-vazio" data-testid="avanco-concluido">
          O personagem chegou ao Ranking {concluido}. A ficha é atualizada em instantes.
        </p>
        <div className="rc-aux-acoes">
          <button type="button" className="rc-ghost" onClick={onFechar}>Fechar</button>
        </div>
      </AuxJanela>
    );
  }

  if (pacote === undefined) {
    return (
      <AuxJanela titulo="Avançar Ranking" onFechar={onFechar}>
        <p className="rc-vazio" role={erro ? "alert" : undefined}>{erro ?? "Carregando o próximo Ranking…"}</p>
        {erro && (
          <div className="rc-aux-acoes">
            <button type="button" className="rc-ghost" onClick={onFechar}>Fechar</button>
          </div>
        )}
      </AuxJanela>
    );
  }

  if (pacote === null) {
    return (
      <AuxJanela titulo="Avançar Ranking" onFechar={onFechar}>
        <p className="rc-vazio">O Ranking S+ é o limite da progressão regular. A partir daqui, a trajetória continua pela ficção.</p>
        <div className="rc-aux-acoes">
          <button type="button" className="rc-ghost" onClick={onFechar}>Fechar</button>
        </div>
      </AuxJanela>
    );
  }

  const { avanco } = pacote;
  const ganhos = [...pacote.caracteristicasClasse, ...pacote.caracteristicasSubclasse];

  return (
    <AuxJanela titulo={`Avançar para o Ranking ${pacote.para}`} onFechar={onFechar}>
      <div data-testid="avanco-ranking">
        <p className="rc-vazio">
          {pacote.classeNome} · Ranking {pacote.de} → {pacote.para} · PA {avanco.pa}
          {avanco.limite_pericia ? ` · limite de Perícia ${avanco.limite_pericia}` : ""}
        </p>

        {ganhos.length > 0 && (
          <section className="rc-avanco-secao">
            <h3>Características recebidas</h3>
            <div className="rc-aux-lista">
              {ganhos.map((f) => (
                <div key={f.slug}>
                  <button type="button" className="rc-aux-item" aria-expanded={aberta === f.slug} onClick={() => setAberta(aberta === f.slug ? null : f.slug)}>
                    <span>{f.nome}</span>
                    <span className="rc-vazio">{aberta === f.slug ? "ocultar" : "ler"}</span>
                  </button>
                  {aberta === f.slug && <p className="rc-vazio rc-avanco-texto">{f.descricao}</p>}
                </div>
              ))}
            </div>
            {avanco.escolhe_subclasse && <p className="rc-vazio">As Características de Subclasse vêm da Subclasse escolhida abaixo.</p>}
          </section>
        )}

        {avanco.escolhe_subclasse && (
          <section className="rc-avanco-secao">
            <h3>Subclasse</h3>
            <div className="rc-aux-lista">
              {pacote.subclasses.map((s) => (
                <div key={s.slug}>
                  <button
                    type="button"
                    className="rc-aux-item"
                    aria-pressed={subclasse === s.slug}
                    onClick={() => setSubclasse(s.slug)}
                    data-testid={`avanco-subclasse-${s.slug}`}
                  >
                    <span>{s.nome}</span>
                  </button>
                  {subclasse === s.slug && <p className="rc-vazio rc-avanco-texto">{s.descricao}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {avanco.pontos_pericia > 0 && (
          <section className="rc-avanco-secao">
            <h3>Perícias · {gastos}/{avanco.pontos_pericia}</h3>
            <div className="rc-avanco-pericias">
              {pacote.pericias.map((p) => {
                const extra = pericias[p.id] ?? 0;
                const novo = p.valor + extra;
                return (
                  <div key={p.id} className="rc-avanco-pericia">
                    <span>{p.nome}</span>
                    <span className="rc-passo">
                      <button
                        type="button"
                        className="rc-passo-btn"
                        disabled={extra === 0}
                        aria-label={`Remover ponto de ${p.nome}`}
                        onClick={() => setPericias(({ [p.id]: atual = 0, ...resto }) => (atual > 1 ? { ...resto, [p.id]: atual - 1 } : resto))}
                      >−</button>
                      <span className="rc-passo-val" data-mudou={extra > 0 ? "true" : undefined}>{novo}</span>
                      <button
                        type="button"
                        className="rc-passo-btn"
                        disabled={gastos >= avanco.pontos_pericia || novo >= avanco.limite_pericia}
                        aria-label={`Adicionar ponto em ${p.nome}`}
                        onClick={() => setPericias((atual) => ({ ...atual, [p.id]: (atual[p.id] ?? 0) + 1 }))}
                        data-testid={`avanco-pericia-${p.id}`}
                      >+</button>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {avanco.pontos_atributo > 0 && (
          <section className="rc-avanco-secao">
            <h3>Atributo · +1</h3>
            <div className="rc-aux-lista">
              {ATRIBUTOS.map((a) => {
                const valor = pacote.atributos[a.id];
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="rc-aux-item"
                    aria-pressed={atributo === a.id}
                    disabled={valor >= 5}
                    onClick={() => setAtributo(a.id)}
                    data-testid={`avanco-atributo-${a.id}`}
                  >
                    <span>{a.nome}</span>
                    <span>{valor}{atributo === a.id ? ` → ${valor + 1}` : ""}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {avanco.pontos_vertente > 0 && (
          <section className="rc-avanco-secao">
            <h3>Vertente · +1</h3>
            <div className="rc-aux-lista">
              {VERTENTES.map((v) => {
                const nivel = pacote.niveisVertente[v.id] ?? 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className="rc-aux-item"
                    aria-pressed={vertente === v.id}
                    disabled={nivel >= 5}
                    onClick={() => setVertente(v.id)}
                    data-testid={`avanco-vertente-${v.id}`}
                  >
                    <span>{v.nome}{nivel === 0 ? " (nova)" : ""}</span>
                    <span>{nivel}{vertente === v.id ? ` → ${nivel + 1}` : ""}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {(avanco.magias_adicionais > 0 || avanco.pontos_vertente > 0) && (
          <p className="rc-vazio">
            As magias concedidas por este avanço ficam registradas como pendentes até o catálogo de magias da v1.2 ser publicado.
          </p>
        )}

        {pendencias.length > 0 && (
          <ul className="rc-avanco-pendencias">
            {pendencias.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        {erro && <p className="rc-vazio" role="alert" style={{ color: "#ffc4cf" }}>{erro}</p>}

        <div className="rc-aux-acoes">
          <button type="button" className="rc-ghost" onClick={onFechar} disabled={enviando}>Cancelar</button>
          <button
            type="button"
            className="rc-ghost"
            onClick={() => void confirmar()}
            disabled={enviando || pendencias.length > 0}
            aria-busy={enviando}
            data-testid="avanco-confirmar"
          >
            {enviando ? "Aplicando…" : `Avançar para ${pacote.para}`}
          </button>
        </div>
      </div>
    </AuxJanela>
  );
}
