"use client";

/**
 * CARTÃO DE HOVER do token — o que substituiu o HUD de token selecionado.
 *
 * O HUD antigo era uma faixa fixa ocupando a base do palco com retrato,
 * recursos, condições, PA, reações e defesa. A premissa dele era que a
 * mesa vive no mapa; na prática o jogador mantém a FICHA aberta durante
 * o combate, e aí o HUD deixava de informar e passava a atrapalhar —
 * tapava mapa o tempo inteiro pra repetir o que já estava na tela ao
 * lado.
 *
 * Este cartão inverte a premissa: nada ocupa espaço permanente, e a
 * informação aparece onde o olho já está — em cima do token — depois de
 * uma parada deliberada do ponteiro. Só o essencial pra decidir no
 * mapa: quem é, e como estão PV/PE/Mana.
 *
 * TRÊS ESTADOS, e quem decide é o SERVIDOR, não esta tela
 * (`projectHud`, em `_acoes/hudActions.ts`):
 *
 *   • sem permissão nenhuma — a projeção não traz recurso algum
 *     (nenhum está público pra quem olha): só o NOME. Um cartão que
 *     mostrasse barras vazias, ou um "sem permissão", contaria sobre o
 *     token justamente o que a mesa escolheu não contar;
 *   • pode ver, não pode editar — barras e números, sem os pips e sem
 *     o clique que abre o campo;
 *   • controla — tudo, com ±1 e edição.
 *
 * As REGRAS DE EDIÇÃO são as mesmas da ficha, não uma segunda
 * implementação: `ResourceValueCard` (clique no valor → campo) com
 * `parseResourceEdit` por baixo, onde "-5" tira 5 do atual, "+3"
 * soma 3 e "7" fixa em 7, sempre preso entre 0 e o máximo. Os pips
 * ±1 e a persistência usam as MESMAS ações do HUD antigo
 * (`readSelectedTokenHudAction`/`mutateSelectedTokenHudAction`), então
 * autorização, visibilidade por recurso e histórico continuam valendo
 * exatamente como valiam.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ResourceValueCard } from "../../../../ficha/_console/panels/ResourceValueCard";
import type { HudResourceId, SelectedTokenHudData } from "../../../../../lib/vtt/hudTypes";
import { mutateSelectedTokenHudAction } from "../_acoes/hudActions";

/** Ordem e identidade visual de cada linha — a mesma do Figma, e os acentos são os do chassi do VTT. */
const RECURSOS: { id: HudResourceId; rotulo: string }[] = [
  { id: "pv", rotulo: "PV" },
  { id: "pe", rotulo: "PE" },
  { id: "mana", rotulo: "Mana" },
];

export interface PropsCartaoTokenHover {
  campaignId: string;
  tokenId: string;
  /**
   * Recursos já lidos pelo mapa — NUNCA nulo, e é isso que o tipo diz.
   * Quem busca é `VttClient`, no instante em que o ponteiro ENTRA no
   * token, e ele só monta este componente quando a resposta chegou.
   *
   * A obrigatoriedade é a regra escrita como tipo: o cartão de "só o
   * nome" é um estado REAL (o de quem não tem permissão nenhuma), e
   * mostrá-lo enquanto a leitura está em voo diria a quem TEM permissão
   * que ela não tem, por um instante, antes de se corrigir.
   */
  dados: SelectedTokenHudData;
  /** Uma escrita voltou do servidor — o mapa guarda o valor novo no cache dele. */
  onDadosAtualizados: (d: SelectedTokenHudData) => void;
  /** Retângulo do DISCO do token na tela, pra ancorar o cartão. */
  ancora: { x: number; y: number; width: number; height: number };
  /** O ponteiro entrou no cartão / saiu dele — quem controla o ciclo de vida é quem chama. */
  onEntrar: () => void;
  onSair: () => void;
  /**
   * Só pro harness visual protegido em /dev — nunca usado pela mesa
   * real. Mesma prop de fixtura que o HUD antigo aceitava, e pelo
   * mesmo motivo: os três estados dependem de autorização de servidor,
   * e a galeria precisa mostrá-los sem forjar sessão nem chamar action.
   */
  dadosFixos?: SelectedTokenHudData;
}

const MARGEM_TELA = 8;

export function CartaoTokenHover(p: PropsCartaoTokenHover) {
  const [dados, setDados] = useState<SelectedTokenHudData>(p.dadosFixos ?? p.dados);
  const [pendente, setPendente] = useState<Set<string>>(new Set());
  const dadosRef = useRef<SelectedTokenHudData | null>(null);
  const montado = useRef(true);
  // Uma escrita de cada vez, na ordem — mesma disciplina do HUD antigo:
  // dois cliques rápidos no mesmo pip são duas mutações sobre a MESMA
  // linha, e mandá-las em paralelo faz a segunda partir de um estado
  // que a primeira ainda vai mudar.
  const fila = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  useEffect(() => {
    const d = p.dadosFixos ?? p.dados;
    if (!d) return;
    dadosRef.current = d;
    setDados(d);
  }, [p.dados, p.dadosFixos]);

  const gravar = useCallback((recurso: HudResourceId, valor: number) => {
    const atual = dadosRef.current;
    if (!atual?.resources[recurso]) return;
    if (p.dadosFixos) {
      // Harness: mexe só no estado local, nunca fala com o servidor.
      const local = { ...atual, resources: { ...atual.resources, [recurso]: { ...atual.resources[recurso]!, atual: valor } } };
      dadosRef.current = local;
      setDados(local);
      return;
    }
    // Otimista: o número muda no clique, não no round-trip. Se o
    // servidor recusar, a resposta de releitura corrige.
    const otimista: SelectedTokenHudData = {
      ...atual,
      resources: { ...atual.resources, [recurso]: { ...atual.resources[recurso]!, atual: valor } },
    };
    dadosRef.current = otimista;
    setDados(otimista);
    setPendente((s) => new Set(s).add(recurso));

    fila.current = fila.current.catch(() => undefined).then(async () => {
      const r = await mutateSelectedTokenHudAction({
        campaignId: p.campaignId, tokenId: p.tokenId,
        mutation: { type: "resource", resource: recurso, value: valor },
      });
      if (!montado.current) return;
      if (r.ok && r.data) { dadosRef.current = r.data; setDados(r.data); p.onDadosAtualizados(r.data); }
      setPendente((s) => { const novo = new Set(s); novo.delete(recurso); return novo; });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.campaignId, p.tokenId, p.dadosFixos]);

  // Posição: acima do token quando cabe, abaixo quando não cabe, e
  // sempre dentro da janela. O cartão é `position: fixed` e vive FORA
  // do `<svg>` de propósito — dentro dele o texto encolheria com o
  // zoom do mapa, que é exatamente o que a hint do mapa já evita.
  //
  // MEDIDO, não estimado: o cartão tem três tamanhos bem diferentes
  // (só o nome, nome + barras, nome + barras + pips) e ele muda de
  // tamanho DEPOIS que os dados chegam. Uma altura fixa chutada aqui
  // acertaria um dos três casos e erraria os outros dois — pondo o
  // cartão por cima do token ou fora da tela.
  const cartaoRef = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = cartaoRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const acimaCabe = p.ancora.y - height - 10 > MARGEM_TELA;
    setPosicao({
      left: Math.min(
        Math.max(MARGEM_TELA, p.ancora.x + p.ancora.width / 2 - width / 2),
        window.innerWidth - width - MARGEM_TELA,
      ),
      top: acimaCabe ? p.ancora.y - height - 10 : p.ancora.y + p.ancora.height + 10,
    });
  }, [p.ancora, dados]);

  const nome = dados.name;
  const podeEditar = dados.canControl === true;
  const recursosVisiveis = RECURSOS.filter(({ id }) => dados.resources[id]);

  return (
    <div
      ref={cartaoRef}
      className="rv-cartao-token"
      // Invisível até estar MEDIDO e posicionado: um quadro no canto
      // errado da tela, mesmo que só um, lê como salto.
      style={{ left: posicao?.left ?? -9999, top: posicao?.top ?? -9999, visibility: posicao ? undefined : "hidden" }}
      onPointerEnter={p.onEntrar}
      onPointerLeave={p.onSair}
      role="dialog"
      aria-label={`Recursos de ${nome}`}
    >
      <p className="rv-cartao-token__nome">{nome}</p>

      {recursosVisiveis.length > 0 && <div className="rv-cartao-token__recursos">
        {recursosVisiveis.map(({ id, rotulo }) => {
          const r = dados.resources[id]!;
          const pct = r.max > 0 ? Math.max(0, Math.min(100, (r.atual / r.max) * 100)) : 0;
          const ocupado = pendente.has(id);
          return (
            <div className="rv-cartao-token__linha" key={id} data-recurso={id} aria-busy={ocupado || undefined}>
              <span className="rv-cartao-token__rot">{rotulo}</span>
              <span
                className="rv-cartao-token__trilho"
                role="progressbar" aria-label={rotulo}
                aria-valuenow={r.atual} aria-valuemin={0} aria-valuemax={r.max}
              >
                <span className="rv-cartao-token__barra" style={{ width: `${pct}%` }} />
              </span>
              <ResourceValueCard
                atual={r.atual}
                max={r.max}
                rotulo={rotulo}
                className="rv-cartao-token__val"
                inputClassName="rv-cartao-token__input"
                readOnly={!podeEditar}
                disabled={ocupado}
                onGravar={(valor) => gravar(id, valor)}
                testIdPrefix="cartao-token-res"
              />
              {podeEditar && (
                <span className="rv-cartao-token__pips">
                  <button
                    type="button" className="rv-cartao-token__pip"
                    onClick={() => gravar(id, Math.max(0, r.atual - 1))}
                    disabled={ocupado || r.atual <= 0}
                    aria-label={`Reduzir ${rotulo} em 1`}
                  >
                    <svg viewBox="0 0 9 9" aria-hidden="true"><path d="M1 4.5h7" /></svg>
                  </button>
                  <button
                    type="button" className="rv-cartao-token__pip"
                    onClick={() => gravar(id, Math.min(r.max, r.atual + 1))}
                    disabled={ocupado || r.atual >= r.max}
                    aria-label={`Aumentar ${rotulo} em 1`}
                  >
                    <svg viewBox="0 0 9 9" aria-hidden="true"><path d="M1 4.5h7M4.5 1v7" /></svg>
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>}
    </div>
  );
}
