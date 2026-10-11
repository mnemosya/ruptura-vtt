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

import { useEffect, useRef, useState } from "react";
import { ArrowUpCircle, Check, Crosshair, Sliders, Wand2 } from "lucide-react";
import { RANKINGS_V12, type RankingV12 } from "../../../../lib/rulesetV12";
import type { ConsoleApi, ConsoleModo } from "../types";
import { useVerNoMapa } from "../ConsoleCloseContext";
// A dica padrão do VTT, por portal (não é recortada pela janela da ficha).
import { useDicaPortal } from "../../../mesas/[campaignId]/vtt/_painel/ui/DicaPortal";

/**
 * "Ver no mapa" — leva a câmera até o token deste personagem e fecha a
 * ficha.
 *
 * Só aparece quando existe pra onde ir: dentro do VTT E com o
 * personagem posicionado na cena. Em Personagens, na Mesa, ou com um
 * personagem que não está em jogo, o botão não é renderizado — melhor
 * ausente do que presente e inerte.
 *
 * Mora aqui, junto do `ModoChip`, porque é a mesma peça de UI: uma
 * ação de barra de título do Console.
 */
export function VerNoMapaChip() {
  const verNoMapa = useVerNoMapa();
  const { alvo, dica } = useDicaPortal("Ver no mapa", { lado: "abaixo" });
  if (!verNoMapa) return null;
  return (
    <>
    <button
      {...alvo}
      type="button"
      className="rc-modo-chip"
      onClick={verNoMapa}
      data-testid="console-ver-no-mapa"
      aria-label="Ver no mapa"
      data-icone="true"
    >
      <span className="rc-modo-chip-ico" aria-hidden="true">
        <Crosshair size={15} strokeWidth={2} />
      </span>
    </button>
    {dica}
    </>
  );
}

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
