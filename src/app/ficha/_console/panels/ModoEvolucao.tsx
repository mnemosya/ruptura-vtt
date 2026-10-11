"use client";

/**
 * MODO EVOLUÇÃO no Console — o interruptor da barra de título e a faixa
 * de aviso que ele acende.
 *
 * Por que existir: o Modo Evolução já era real (`sheetMode` em
 * `CharacterSheetClient`, `updateAtributo`/`updatePericia` com clamp,
 * recálculo de derivados, `logPermanentAdjustment` e `table_logs`), mas
 * a ÚNICA porta pra ele era o `ModeToggle` da aba Geral — que o Console
 * do produto nem mostra. Dentro do VTT, portanto, não havia como
 * evoluir a ficha. Aqui ele ganha a porta, sem regra nova nenhuma.
 *
 * Escolhas visuais (linguagem do `console.css`, nada inventado):
 *   · ÂMBAR, nunca vermelho — evolução é ação deliberada, não perigo;
 *     é a mesma cor que o produto já usa para "pendência/atenção".
 *   · O interruptor é um CHIP na barra de título, ao lado dos controles
 *     de janela: fica sempre visível, em qualquer aba, sem ocupar
 *     espaço do conteúdo.
 *   · Ao ligar, uma FAIXA aparece sob a barra de título. Ela não é
 *     decorativa: diz o que muda (permanente + auditado) e mostra o PM
 *     real quando a ficha tem PM. Sem PM registrado, não inventa "0/0"
 *     — simplesmente não mostra o bloco.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpCircle, Check, Moon, Sliders, Wand2 } from "lucide-react";
import { MAX_OVERLOAD_SURGES_PER_DAY, type Character, type DerivedStats } from "../../../../lib/character";
import { applyLongRest, applyShortRest } from "../../../../lib/character/rest";
import { RANKINGS_V12, type RankingV12 } from "../../../../lib/rulesetV12";
import type { ConsoleApi, ConsoleModo } from "../types";
// A dica padrão do VTT, por portal (não é recortada pela janela da ficha).
import { useDicaPortal } from "../../../mesas/[campaignId]/vtt/_painel/ui/DicaPortal";

/**
 * O QUE ESTÁ ACONTECENDO COM A GRAVAÇÃO — só quando há o que dizer.
 *
 * A ficha grava sozinha desde 2026-09-21, e com isso não existe mais um
 * "Salvar personagem" para a pessoa apertar de novo quando algo falha.
 * Esse retorno vivia numa faixa na página de baixo, que o Console cobria
 * e que foi removida junto com ela.
 *
 * CALADO no caminho feliz, de propósito. Um selo permanente de "salvo"
 * vira ruído e deixa de ser lido justamente quando muda — o que precisa
 * chamar atenção é a FALHA. Enquanto grava, avisa discretamente; se
 * falhou, diz e carrega o motivo no `title`.
 */
export function GravacaoChip({ estado, erro }: { estado: "idle" | "saving" | "saved" | "error"; erro: string | null }) {
  if (estado === "idle" || estado === "saved") return null;
  const falhou = estado === "error";
  return (
    <span
      className="rc-modo-chip"
      data-testid="console-gravacao"
      data-erro={falhou ? "true" : undefined}
      role={falhou ? "alert" : "status"}
      title={falhou ? (erro ?? "A ficha não conseguiu salvar.") : "Salvando a ficha…"}
      style={falhou ? { color: "#ff5f74", borderColor: "#5a2424" } : { opacity: 0.75 }}
    >
      {falhou ? "não salvou" : "salvando…"}
    </span>
  );
}

/**
 * Personagem criado só com o nome: abre o assistente v1.2 para completar a
 * criação (Classe, Trajetória, perícias, equipamento) mantendo o mesmo
 * personagem. Substitui o Ajustar e o Ranking até a criação ser concluída.
 */
export function CompletarCriacaoChip({ onAbrir }: { onAbrir: () => void }) {
  return (
    <button
      type="button"
      className="rc-modo-chip"
      onClick={onAbrir}
      title="Completar a criação deste personagem pelo assistente RUPTURA v1.2"
      data-testid="console-completar-criacao"
    >
      <span className="rc-modo-chip-ico" aria-hidden="true">
        <Wand2 size={12} strokeWidth={2} />
      </span>
      Completar criação
    </button>
  );
}

export function ModoChip({ modo, onAlternar, v12 = false }: { modo: ConsoleModo; onAlternar: (m: ConsoleModo) => void; v12?: boolean }) {
  const evolucao = modo === "evolucao";
  const { alvo, dica } = useDicaPortal(evolucao ? "Concluir ajustes" : "Ajustar", { lado: "abaixo" });
  return (
    <>
    <button
      {...alvo}
      type="button"
      className="rc-modo-chip"
      data-evolucao={evolucao ? "true" : undefined}
      aria-pressed={evolucao}
      aria-label={evolucao ? "Concluir" : "Ajustar"}
      data-icone="true"
      onClick={() => onAlternar(evolucao ? "jogo" : "evolucao")}
      data-testid="console-modo-chip"
    >
      <span className="rc-modo-chip-ico" aria-hidden="true">
        {evolucao ? <Check size={15} strokeWidth={2.4} /> : <Sliders size={15} strokeWidth={2} />}
      </span>
    </button>
    {dica}
    </>
  );
}

/* Aqui ficava a FAIXA DE AVISO do Modo Evolução — selo, a frase
   "alterações são permanentes e ficam no histórico" e o contador de
   PM. Saiu: o aviso repetia, em uma faixa fixa, o que o próprio chip
   da barra de título já diz ao ficar âmbar, e custava uma tira inteira
   de altura da janela em TODA sessão de evolução — a mesma troca ruim
   que o HUD do token fazia no mapa.

   O que saiu junto e NÃO tem outro lugar hoje: o contador de PM
   (`api.pm`). O dado continua existindo na API do Console; só não é
   mostrado em lugar nenhum. */

/**
 * Passo −/+ de um valor permanente. Aparece SÓ em Modo Evolução; em
 * Modo Jogo o card volta a ser só o botão de rolar, intocado.
 *
 * `min`/`max` vêm das regras publicadas (o handler do client clampa de
 * novo — isto aqui é só para desabilitar a ponta e não oferecer um
 * passo que seria recusado).
 */
export function PassoValor({
  valor,
  min,
  max,
  rotulo,
  onDefinir,
  testId,
}: {
  valor: number;
  min: number;
  max: number;
  rotulo: string;
  onDefinir: (novo: number) => void;
  testId?: string;
}) {
  return (
    <span className="rc-passo" data-testid={testId}>
      <button
        type="button"
        className="rc-passo-btn"
        disabled={valor <= min}
        aria-label={`Diminuir ${rotulo}`}
        onClick={(e) => {
          e.stopPropagation();
          onDefinir(valor - 1);
        }}
      >
        −
      </button>
      <span className="rc-passo-val" aria-label={`${rotulo}: ${valor}`}>
        {valor}
      </span>
      <button
        type="button"
        className="rc-passo-btn"
        disabled={valor >= max}
        aria-label={`Aumentar ${rotulo}`}
        onClick={(e) => {
          e.stopPropagation();
          onDefinir(valor + 1);
        }}
      >
        +
      </button>
    </span>
  );
}

/**
 * Avanço de Ranking para personagens RUPTURA v1.2. Substitui o Modo
 * Evolução livre: em v1.2 a ficha só muda pelo pacote do próximo Ranking
 * (capítulo 25), validado no servidor.
 */
export function AvancoChip({ ranking, onEscolher }: { ranking: string; onEscolher: (alvo: RankingV12) => void }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);
  const atual = RANKINGS_V12.indexOf(ranking as RankingV12);
  const { alvo, dica } = useDicaPortal("Evoluir ranking", { lado: "abaixo" });
  return (
    <span className="rc-rank-escolha" ref={ref}>
      <button
        {...alvo}
        type="button"
        className="rc-modo-chip"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="true"
        data-testid="console-avanco-chip"
        aria-label={`Evoluir ranking (atual: ${ranking})`}
        data-icone="true"
      >
        <span className="rc-modo-chip-ico" aria-hidden="true">
          <ArrowUpCircle size={15} strokeWidth={2} />
        </span>
      </button>
      {!aberto && dica}
      {/* O mesmo seletor da placa da Forja: os Rankings até o atual ficam
          apagados; escolher um acima abre a Forja de evolução até ele. */}
      {aberto && (
        <span className="rc-rank-menu" role="group" aria-label="Evoluir até o Ranking">
          <span className="rc-rank-menu__titulo">Evoluir até</span>
          <span className="rc-rank-menu__grade">
            {RANKINGS_V12.map((r, i) => (
              <button key={r} type="button" disabled={i <= atual} aria-current={i === atual ? "true" : undefined}
                className="rc-rank-menu__opcao" onClick={() => { setAberto(false); onEscolher(r); }}>{r}</button>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * Descanso (cap. 16, "Descansos e recuperação"). Painel ancorado ao
 * botão: escolhe Curto ou Longo e mostra a PRÉVIA do resultado com os
 * números deste personagem (antes → depois, em barra na cor do recurso).
 * Ver o que muda é a confirmação: um botão só aplica. A prévia sai das
 * mesmas funções puras que aplicam o descanso (`lib/character/rest.ts`),
 * então o que se vê é exatamente o que acontece.
 */
type TipoDescanso = "curto" | "longo";

const LINHAS_DESCANSO: { chave: "pv" | "pe" | "mana" | "sobrecarga_usada_dia"; rotulo: string; cor: string }[] = [
  { chave: "pv", rotulo: "PV", cor: "#d84f6c" },
  { chave: "pe", rotulo: "PE", cor: "#8d62e8" },
  { chave: "mana", rotulo: "Mana", cor: "#00d4ff" },
  { chave: "sobrecarga_usada_dia", rotulo: "Sobrec.", cor: "#ff8a1f" },
];

export function DescansoChip({
  character,
  derivados,
  onDescansar,
}: {
  character: Character;
  derivados: DerivedStats;
  onDescansar: (tipo: TipoDescanso) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoDescanso>("curto");
  const ancora = useRef<HTMLButtonElement | null>(null);
  const painel = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const { alvo, dica } = useDicaPortal("Descansar", { lado: "abaixo" });

  useLayoutEffect(() => {
    if (!aberto || !ancora.current) return;
    const r = ancora.current.getBoundingClientRect();
    const largura = painel.current?.offsetWidth ?? 300;
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.right - largura, window.innerWidth - largura - 8)) });
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    // Esc fecha SÓ o painel: o Console escuta o Esc no `document` e
    // fecharia a ficha inteira — o `window` em captura vem antes.
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setAberto(false);
      ancora.current?.focus({ preventScroll: true });
    };
    const fora = (e: PointerEvent) => {
      const t = e.target as Node;
      if (painel.current?.contains(t) || ancora.current?.contains(t)) return;
      setAberto(false);
    };
    window.addEventListener("keydown", tecla, true);
    window.addEventListener("pointerdown", fora);
    return () => { window.removeEventListener("keydown", tecla, true); window.removeEventListener("pointerdown", fora); };
  }, [aberto]);

  const previa = useMemo(() => {
    if (!aberto) return null;
    const agora = new Date().toISOString();
    return tipo === "curto" ? applyShortRest(character, derivados, agora) : applyLongRest(character, derivados, agora);
  }, [aberto, tipo, character, derivados]);

  const maximo = { pv: derivados.pv_max ?? 0, pe: derivados.pe_max ?? 0, mana: derivados.mana_max ?? 0, sobrecarga_usada_dia: MAX_OVERLOAD_SURGES_PER_DAY };
  const linhas = previa
    ? LINHAS_DESCANSO.filter((l) => tipo === "longo" || l.chave === "mana")
    : [];
  const fracao = (v: number, max: number) => (max > 0 ? Math.max(0, Math.min(1, v / max)) * 100 : 0);

  return (
    <>
      <button
        {...alvo}
        ref={ancora}
        type="button"
        className="rc-modo-chip"
        data-icone="true"
        aria-label="Descansar"
        aria-expanded={aberto}
        aria-haspopup="dialog"
        onClick={() => setAberto((v) => !v)}
        data-testid="console-descanso-chip"
      >
        <span className="rc-modo-chip-ico" aria-hidden="true">
          <Moon size={15} strokeWidth={2} />
        </span>
      </button>
      {!aberto && dica}
      {aberto && previa && typeof document !== "undefined" && createPortal(
        <div
          ref={painel}
          className="rc-descanso"
          role="dialog"
          aria-label="Descansar"
          style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
          data-testid="console-descanso-painel"
          // Portal ainda propaga eventos pela árvore React: sem isto, o
          // arrastar da janela do Console pegava o clique (e o selecionar
          // texto) do painel e movia a ficha.
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="rc-descanso__seg" role="group" aria-label="Tipo de descanso">
            {(["curto", "longo"] as const).map((t) => (
              <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)} data-testid={`console-descanso-${t}`}>
                {t === "curto" ? "Curto · 30 min" : "Longo · 8 h"}
              </button>
            ))}
          </div>
          <div className="rc-descanso__linhas">
            {linhas.map((l) => {
              const antes = previa.before[l.chave];
              const depois = previa.after[l.chave];
              const max = maximo[l.chave];
              return (
                <div key={l.chave} className="rc-descanso__linha" style={{ ["--rc-desc-cor" as string]: l.cor }} data-igual={antes === depois || undefined}>
                  <span className="rc-descanso__rot">{l.rotulo}</span>
                  <span className="rc-descanso__barra" aria-hidden="true">
                    <i style={{ width: `${fracao(Math.max(antes, depois), max)}%` }} data-fantasma="true" />
                    <i style={{ width: `${fracao(Math.min(antes, depois), max)}%` }} />
                  </span>
                  <span className="rc-descanso__val">{antes}<span> → </span>{depois}</span>
                </div>
              );
            })}
          </div>
          {tipo === "longo" && <p className="rc-descanso__nota">Zera PV e Mana temporários.</p>}
          <button
            type="button"
            className="rv-btn rv-btn--pri rc-descanso__cta"
            onClick={() => { setAberto(false); onDescansar(tipo); }}
            data-testid="console-descanso-aplicar"
          >
            {tipo === "longo" ? "Descansar 8 h" : "Descansar 30 min"}
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
