"use client";

/** Completa os avanços necessários para o rank escolhido na criação. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RANKINGS_V12, VERTENTES_V12, type AttributeIdV12, type RankingV12 } from "../../../../../lib/rulesetV12";
import { avancarRankingV12Action, lerAvancoV12Action, type PacoteAvancoV12 } from "../_acoes/evolucaoV12Actions";

const ATRIBUTOS: { id: AttributeIdV12; nome: string }[] = [
  { id: "corpo", nome: "Corpo" }, { id: "mente", nome: "Mente" }, { id: "animo", nome: "Ânimo" },
];

export function ProgressaoInicial({ campaignId, characterId, alvo, onConcluir }: {
  /** Nulo: personagem sem campanha (o dono avança com o conteúdo oficial). */
  campaignId: string | null;
  characterId: string;
  alvo: RankingV12;
  onConcluir: () => void;
}) {
  const [pacote, setPacote] = useState<PacoteAvancoV12 | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [subclasse, setSubclasse] = useState("");
  const [pericias, setPericias] = useState<Record<string, number>>({});
  const [atributo, setAtributo] = useState<AttributeIdV12 | "">("");
  const [vertente, setVertente] = useState("");
  const concluirRef = useRef(onConcluir);
  const concluidoRef = useRef(false);
  concluirRef.current = onConcluir;

  const concluir = useCallback(() => {
    if (concluidoRef.current) return;
    concluidoRef.current = true;
    concluirRef.current();
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await lerAvancoV12Action(campaignId, characterId);
    if (r.ok && (!r.dados || RANKINGS_V12.indexOf(r.dados.de) >= RANKINGS_V12.indexOf(alvo))) {
      concluir();
      return;
    }
    if (!r.ok || !r.dados) {
      setErro(r.erro ?? "Não foi possível ler o próximo avanço.");
      setPacote(null);
    } else {
      setPacote(r.dados);
      setErro(null);
      setSubclasse(""); setPericias({}); setAtributo(""); setVertente("");
    }
    setCarregando(false);
  }, [campaignId, characterId, alvo, concluir]);

  useEffect(() => { void carregar(); }, [carregar]);

  const gastos = useMemo(() => Object.values(pericias).reduce((s, n) => s + n, 0), [pericias]);
  const avanco = pacote?.avanco;
  const completo = Boolean(pacote && avanco &&
    (!avanco.escolhe_subclasse || subclasse) &&
    gastos === avanco.pontos_pericia &&
    (!avanco.pontos_atributo || atributo) &&
    (!avanco.pontos_vertente || vertente));

  async function confirmar() {
    if (!pacote || !completo || ocupado) return;
    setOcupado(true);
    setErro(null);
    const r = await avancarRankingV12Action(campaignId, characterId, {
      ...(subclasse ? { subclasse_id: subclasse } : {}),
      ...(gastos ? { pericias } : {}),
      ...(atributo ? { atributo } : {}),
      ...(vertente ? { vertente } : {}),
    });
    if (!r.ok || !r.dados) {
      setErro(r.erro ?? "Não foi possível aplicar o avanço.");
      setOcupado(false);
      return;
    }
    if (RANKINGS_V12.indexOf(r.dados.ranking) >= RANKINGS_V12.indexOf(alvo)) concluir();
    else await carregar();
    setOcupado(false);
  }

  const faltam = pacote ? RANKINGS_V12.indexOf(alvo) - RANKINGS_V12.indexOf(pacote.de) : 0;
  return (
    <div className="fj-progressao__backdrop" role="presentation">
      <section className="fj-progressao" role="dialog" aria-modal="true" aria-label={`Progressão inicial até o Rank ${alvo}`}>
        <header className="fj-progressao__header">
          <span>SYS.FORGE // PROGRESSÃO INICIAL</span>
          <h2>Rank {pacote?.de ?? "F"} → {pacote?.para ?? alvo}</h2>
          <p>Rank escolhido: {alvo}{faltam > 0 ? ` · ${faltam} avanço${faltam > 1 ? "s" : ""} restante${faltam > 1 ? "s" : ""}` : ""}</p>
        </header>
        {carregando ? <p className="fj-progressao__estado">Carregando progressão…</p> : pacote && avanco ? (
          <div className="fj-progressao__corpo">
            <p className="fj-progressao__resumo">{pacote.classeNome} · PA {avanco.pa} · Limite de perícia {avanco.limite_pericia}</p>
            {avanco.escolhe_subclasse && <fieldset className="fj-progressao__grupo">
              <legend>Subclasse</legend>
              <div className="fj-progressao__opcoes">{pacote.subclasses.map((s) => <button key={s.slug} type="button" aria-pressed={subclasse === s.slug}
                onClick={() => setSubclasse(s.slug)} title={s.descricao}>{s.nome}</button>)}</div>
            </fieldset>}
            {avanco.pontos_pericia > 0 && <fieldset className="fj-progressao__grupo">
              <legend>Perícias · {gastos}/{avanco.pontos_pericia}</legend>
              <div className="fj-progressao__pericias">{pacote.pericias.map((p) => {
                const extra = pericias[p.id] ?? 0;
                const valor = p.valor + extra;
                return <div key={p.id} className="fj-progressao__pericia">
                  <span>{p.nome}</span><div>
                    <button type="button" aria-label={`Remover ponto de ${p.nome}`} disabled={!extra} onClick={() => setPericias((atual) => {
                      const novo = { ...atual }; if (novo[p.id] <= 1) delete novo[p.id]; else novo[p.id]--; return novo;
                    })}>−</button>
                    <strong>{valor}</strong>
                    <button type="button" aria-label={`Adicionar ponto em ${p.nome}`} disabled={gastos >= avanco.pontos_pericia || valor >= avanco.limite_pericia}
                      onClick={() => setPericias((atual) => ({ ...atual, [p.id]: (atual[p.id] ?? 0) + 1 }))}>+</button>
                  </div>
                </div>;
              })}</div>
            </fieldset>}
            {avanco.pontos_atributo > 0 && <fieldset className="fj-progressao__grupo">
              <legend>Atributo · +1</legend>
              <div className="fj-progressao__opcoes">{ATRIBUTOS.map((a) => <button key={a.id} type="button" aria-pressed={atributo === a.id}
                disabled={pacote.atributos[a.id] >= 5} onClick={() => setAtributo(a.id)}>{a.nome} · {pacote.atributos[a.id]} → {pacote.atributos[a.id] + 1}</button>)}</div>
            </fieldset>}
            {avanco.pontos_vertente > 0 && <fieldset className="fj-progressao__grupo">
              <legend>Vertente · +1</legend>
              <div className="fj-progressao__opcoes">{VERTENTES_V12.map((id) => <button key={id} type="button" aria-pressed={vertente === id}
                disabled={(pacote.niveisVertente[id] ?? 0) >= 5} onClick={() => setVertente(id)}>{id} · {pacote.niveisVertente[id] ?? 0} → {(pacote.niveisVertente[id] ?? 0) + 1}</button>)}</div>
            </fieldset>}
          </div>
        ) : null}
        {erro && <p className="fj-progressao__erro" role="alert">{erro}</p>}
        <footer className="fj-progressao__footer">
          {erro && !pacote && <button type="button" onClick={() => void carregar()}>Tentar novamente</button>}
          <button type="button" disabled={!completo || ocupado || carregando} onClick={() => void confirmar()}>
            {ocupado ? "Aplicando…" : pacote?.para === alvo ? `Concluir no Rank ${alvo}` : `Avançar para ${pacote?.para ?? "…"}`}
          </button>
        </footer>
      </section>
    </div>
  );
}
