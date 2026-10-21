"use client";

/**
 * Modais auxiliares do Console. Todos são PLACEHOLDERS FUNCIONAIS: a
 * interface definitiva de cada um está fora deste escopo, mas nenhum
 * inventa dado — todos operam sobre o conteúdo real e chamam o fluxo
 * existente. Podem ser trocados sem alterar a lógica que os alimenta.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Anchor, BatteryCharging, Bomb, Check, CircleAlert, Crosshair, EyeOff, Scale, Shield, Swords, Timer, TriangleAlert, Wind, X, Zap } from "lucide-react";
import { FAMILIAS_CONDICAO, ICONE_CONDICAO } from "./condicoesVisual";
import { deriveItemProperties } from "../../../../lib/character/inventory";
import { SURTOS_SOBRECARGA } from "../../../../lib/rulesetV12/ruptura";
import "./hud/hud-base.css";
import "./hud/surto.css";
import { oxanium } from "../../../_design/oxanium";
import { Plus as ConsolePlus } from "../../../_design/icons";
import type { RupturaRollResult } from "../../../../lib/dice/types";
import {
  ACCENTS, BODY, DISPLAY, DadosRolados, FaixaResultado, GroupLabel, INK, INK_FAINT, Leitura, MONO,
  MolduraRolagem, RESULTS, Stack, type ResultKey,
} from "../../../mesas/[campaignId]/vtt/_dados3d/ResultadoRolagem";
import type { InventoryItemInstance, ItemContent } from "../../../../lib/character";
import { BODY_SLOT_LABELS, itensCompativeisComSlot, type BodySlotId } from "../slots";
import { useCentroDoConsole } from "../useCentroDoConsole";
import type { ConsoleApi } from "../types";

export function AuxJanela({
  titulo,
  onFechar,
  cabecalho,
  plano,
  children,
}: {
  titulo: string;
  onFechar: () => void;
  /** Substitui o `<h2>` por uma faixa própria — ver a janela da arma. */
  cabecalho?: ReactNode;
  /** Sem recuo interno: quem desenha as seções é o conteúdo. */
  plano?: boolean;
  children: ReactNode;
}) {
  const centro = useCentroDoConsole();
  return (
    <div
      className="rc-aux-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        className="rc-aux"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        data-plano={plano ? "true" : undefined}
        style={centro ? { position: "absolute", left: centro.x, top: centro.y, transform: "translate(-50%, -50%)" } : undefined}
      >
        {cabecalho ?? <h2>{titulo}</h2>}
        {children}
      </div>
    </div>
  );
}

/**
 * Casca dos seletores definitivos do Console. Diferente de `Aux`, que
 * ainda atende vários placeholders, esta peça replica a anatomia dos
 * cards do personagem: título mono, faixa de identificação, conteúdo
 * rente às bordas e rodapé fixo.
 */
export function ConsolePicker({
  titulo,
  id,
  modulo,
  tamanho = "normal",
  onFechar,
  children,
  rodape,
  modal = true,
  testId,
  arrastavel = false,
}: {
  titulo: string;
  id: string;
  modulo: string;
  tamanho?: "normal" | "largo";
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  modal?: boolean;
  testId?: string;
  /** Opt-in: mantém os seletores existentes parados; ações do token podem ser movidas para liberar o mapa. */
  arrastavel?: boolean;
}) {
  const tituloId = useId();
  const centro = useCentroDoConsole();
  const janelaRef = useRef<HTMLElement>(null);
  const gestoRef = useRef<{ x: number; y: number } | null>(null);
  const [deslocamento, setDeslocamento] = useState({ x: 0, y: 0 });

  function iniciarArrasto(event: React.PointerEvent<HTMLElement>) {
    if (!arrastavel || (event.target as Element).closest("button, a, input, select, textarea")) return;
    gestoRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moverArrasto(event: React.PointerEvent<HTMLElement>) {
    const gesto = gestoRef.current;
    const janela = janelaRef.current;
    if (!gesto || !janela) return;
    const dx = event.clientX - gesto.x, dy = event.clientY - gesto.y;
    const caixa = janela.getBoundingClientRect();
    const margem = 8;
    const ajustadoX = Math.max(margem - caixa.left, Math.min(dx, window.innerWidth - margem - caixa.right));
    const ajustadoY = Math.max(margem - caixa.top, Math.min(dy, window.innerHeight - margem - caixa.bottom));
    setDeslocamento(p => ({ x: p.x + ajustadoX, y: p.y + ajustadoY }));
    gestoRef.current = { x: event.clientX, y: event.clientY };
  }
  function terminarArrasto(event: React.PointerEvent<HTMLElement>) {
    if (!gestoRef.current) return;
    gestoRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  useEffect(() => {
    function fecharComEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onFechar();
    }
    window.addEventListener("keydown", fecharComEscape, true);
    return () => window.removeEventListener("keydown", fecharComEscape, true);
  }, [onFechar]);

  return (
    <div
      className="rc-picker-backdrop rc-cursor-scope"
      data-nao-modal={!modal || undefined}
      onMouseDown={(event) => {
        if (modal && event.target === event.currentTarget) onFechar();
      }}
    >
      <section
        ref={janelaRef}
        className="rc-picker"
        data-testid={testId}
        data-tamanho={tamanho}
        role="dialog"
        aria-modal={modal}
        aria-labelledby={tituloId}
        style={centro || arrastavel ? {
          position: "absolute",
          left: centro?.x ?? window.innerWidth / 2,
          top: centro?.y ?? window.innerHeight / 2,
          transform: `translate(calc(-50% + ${deslocamento.x}px), calc(-50% + ${deslocamento.y}px))`,
        } : undefined}
      >
        <header className="rc-picker-cab" data-arrastavel={arrastavel || undefined}
          onPointerDown={iniciarArrasto} onPointerMove={moverArrasto}
          onPointerUp={terminarArrasto} onPointerCancel={terminarArrasto}>
          <h2 id={tituloId}>{titulo}</h2>
          <button type="button" className="rc-picker-fechar" onClick={onFechar} aria-label={`Fechar ${titulo.toLowerCase()}`}>
            <X size={15} aria-hidden="true" />
          </button>
        </header>
        <div className="rc-picker-modulo" aria-hidden="true">
          <span>{id}</span>
          <span>{modulo}</span>
        </div>
        <div className="rc-picker-corpo">{children}</div>
        {rodape !== undefined && <footer className="rc-picker-rodape">{rodape}</footer>}
      </section>
    </div>
  );
}

function PickerOption({
  indice,
  nome,
  selecionado,
  atalho,
  mostrarMarca = true,
  onClick,
}: {
  indice: number;
  nome: string;
  selecionado: boolean;
  atalho?: string;
  mostrarMarca?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rc-picker-opcao"
      aria-pressed={selecionado}
      aria-keyshortcuts={atalho}
      onClick={onClick}
    >
      <span className="rc-picker-indice" data-atalho={atalho ? "true" : undefined} aria-hidden="true">
        {atalho ?? String(indice + 1).padStart(2, "0")}
      </span>
      <span className="rc-picker-nome">{nome}</span>
      {mostrarMarca && (
        <span className="rc-picker-marca" aria-hidden="true">
          {selecionado ? <Check size={14} /> : <ConsolePlus size={14} strokeWidth={1.6} />}
        </span>
      )}
    </button>
  );
}

/**
 * RESULTADO DE ROLAGEM — a ferramenta "Rolar Dados", em versão de
 * leitura.
 *
 * Antes era uma lista de números em texto corrido. Agora é o MESMO
 * corpo da ferramenta flutuante do VTT (`_dados3d/RoladorDados`), pelas
 * mesmas peças (`_dados3d/ResultadoRolagem`): a fileira de d8 com o
 * maior aceso e a faixa de resultado com a classificação de margem.
 * Vale pra TODA rolagem do Console — atributo, perícia e as quatro
 * defesas passam por aqui.
 *
 * O que da ferramenta NÃO veio junto, e por quê:
 *
 *  · "Rolando como" — a ferramenta pergunta por qual personagem rolar
 *    porque quem a abre pode controlar vários. O Console JÁ É um
 *    personagem: a identidade não é escolha, é o contexto.
 *  · Abas "Atributo & Perícia" / "Livre" — o que vai ser rolado foi
 *    decidido pelo clique que abriu isto. Uma bandeja livre aqui seria
 *    uma segunda rolagem, não a leitura desta.
 *  · Os dois `Select` (atributo, perícia) e o `Stepper` de
 *    modificadores viram LEITURA. A rolagem já aconteceu — com
 *    talentos, condições e a penalidade de Reação já aplicados por
 *    `rollPericia`/`applyConsoleMutation`. Um controle editável aqui
 *    prometeria refazer a conta e não refaria.
 *  · "Definir CD" — mesma razão; a CD aparece na faixa quando a
 *    rolagem teve uma, e vira "sem CD definida" quando não teve.
 *  · Seletor de visibilidade (Mesa/Privada/Narrador) — a rolagem do
 *    Console é publicada como `public`, com origem "Console do
 *    Personagem", ANTES deste modal abrir. Oferecer a escolha depois
 *    seria oferecer algo que já não dá pra mudar.
 *  · Botão "Rolar"/"Rolar de novo" — a ferramenta rola; isto RELATA.
 *    Um botão de rolar aqui gravaria uma segunda linha em `table_logs`
 *    sem que ninguém tivesse pedido um segundo teste.
 *  · Dados 3D no palco — o Console também roda fora do VTT (`/ficha`,
 *    harness da ficha), onde não existe mesa pra jogar dado em cima. As
 *    faces chatas (`PolyDie`) são as mesmas que a ferramenta usa
 *    depois que os dados param.
 *
 * E o que é do Console e a ferramenta não tinha: o aviso de defesa sem
 * Reação, o talento que promoveu a margem e os dados de gatilho.
 */
export function RollResultModal({
  resultado,
  defesa,
  personagem,
  onFechar,
}: {
  resultado: RupturaRollResult;
  defesa?: { usouReacao: boolean; penalidade: number; defesasSemReacao: number };
  /** Nome de quem rolou — ocupa o lugar que a ferramenta dá à ficha escolhida. */
  personagem?: string | null;
  onFechar: () => void;
}) {
  const centro = useCentroDoConsole();
  const nd8 = resultado.quantidadeDados;
  const rotuloSelecao = resultado.modoSelecao === "lowest" ? "menor dado" : "maior dado";
  const natureza = defesa
    ? "Defesa"
    : resultado.periciaNome
      ? "Teste de perícia"
      : "Teste de atributo";
  // Dados de gatilho (Pistoleiro) já vêm somados em `dados`/`maiorDado`;
  // aqui é só dizer QUAIS foram, senão a fileira mostra um dado a mais
  // que o atributo permite sem explicar de onde saiu.
  const gatilho = resultado.dadosGatilhoResultados?.length
    ? resultado.dadosGatilhoResultados
    : resultado.dadoGatilhoResultado != null
      ? [resultado.dadoGatilhoResultado]
      : [];

  return (
    <div style={CAMADA_ROLAGEM}>
      <div style={centro
        ? { position: "absolute", left: centro.x, top: centro.y, transform: "translate(-50%, -50%)", pointerEvents: "auto" }
        : { pointerEvents: "auto" }}>
      <MolduraRolagem
        indice="01"
        codigo="Rolagem"
        titulo="Rolar Dados"
        modo={`d8 · ${rotuloSelecao} + perícia + modificadores`}
        aoFechar={onFechar}
        rotuloFechar="Fechar rolagem"
      >
      {defesa && !defesa.usouReacao && (
        <div className="rc-aux-defesa-aviso" role="status">
          <TriangleAlert size={15} aria-hidden="true" />
          <span>
            Sem Reação disponível — {defesa.defesasSemReacao}ª defesa sem Reação nesta rodada, penalidade cumulativa de{" "}
            <strong>{defesa.penalidade}</strong> já aplicada abaixo.
          </span>
        </div>
      )}

      <Stack gap={16}>
        <div>
          <GroupLabel
            right={personagem ? (
              <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: INK_FAINT }}>
                {personagem}
              </span>
            ) : undefined}
          >
            {natureza}
          </GroupLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Leitura label="Atributo · nº d8">{resultado.atributoNome} · {nd8}d8</Leitura>
            <Leitura label="Perícia · bônus">
              {resultado.periciaNome ? `${resultado.periciaNome} · +${resultado.periciaValor}` : "Sem perícia"}
            </Leitura>
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: INK_FAINT }}>
              Modificadores
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: resultado.modificador === 0 ? INK_FAINT : INK }}>
              {resultado.modificador >= 0 ? `+${resultado.modificador}` : String(resultado.modificador)}
            </span>
          </div>
        </div>

        <div style={{ borderRadius: 0, padding: 14, background: "#0c1920", border: "1px solid #162d3a" }}>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: INK_FAINT }}>
              Pool · <span style={{ color: "#00d4ff" }}>{nd8}d8</span> · {rotuloSelecao}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: INK_FAINT }}>
              {resultado.cd == null ? "sem CD definida" : `cd ${resultado.cd}`}
            </span>
          </div>
          <div data-testid="console-roll-dados">
            <DadosRolados
              dados={resultado.dados}
              maiorDado={resultado.maiorDado}
              size={40}
              landed
              acento={resultado.classificacaoMargem ? RESULTS[resultado.classificacaoMargem as ResultKey].accent : undefined}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <FaixaResultado
              testIdTotal="console-roll-total"
              r={{
                maiorDado: resultado.maiorDado,
                modoSelecao: resultado.modoSelecao,
                pericia: resultado.periciaNome ?? null,
                periciaValor: resultado.periciaValor,
                modificador: resultado.modificador,
                total: resultado.total,
                cd: resultado.cd ?? null,
                classificacao: resultado.classificacaoMargem ?? null,
              }}
              nota={resultado.promocaoAplicada ? (
                <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: ACCENTS.arcane.hex }}>
                  margem promovida por {resultado.promocaoAplicada}
                </div>
              ) : undefined}
            />
          </div>
          {gatilho.length > 0 && (
            <p style={{ margin: "10px 0 0", fontFamily: BODY, fontSize: 11.5, lineHeight: 1.5, color: INK_FAINT }}>
              Dado de gatilho: {gatilho.join(", ")}
              {resultado.dadoGatilhoEscolhido ? ` — foi o ${rotuloSelecao} da rolagem.` : " — já incluído no pool acima."}
            </p>
          )}
        </div>
      </Stack>

      </MolduraRolagem>
      </div>
    </div>
  );
}

/**
 * Mesma camada sem backdrop do painel de rolagem do Console (ver
 * `PainelRolagem`): a janela flutua, o mapa atrás continua clicável, e
 * fechar é pelo X.
 */
const CAMADA_ROLAGEM: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 520,
  pointerEvents: "none",
  display: "grid", placeItems: "center", padding: 24,
};

/**
 * Surto de Sobrecarga (RUPTURA 1.2, cap. 18). Lista os seis surtos do
 * livro com custo, efeito e quando anunciar, e mostra antes de liberar
 * o que acontece: os pontos entram na trilha, cada um causa o dado de
 * dano psíquico, e alcançar o limite pede Vontade CD 7 e provoca uma
 * Ruptura. Surtos que passariam do limite ficam indisponíveis.
 */
const ICONE_SURTO: Record<string, typeof Zap> = {
  "Surto de Energia": BatteryCharging,
  "Surto de Foco": Crosshair,
  "Surto de Desequilíbrio": Scale,
  "Surto de Impacto": Bomb,
  "Surto de Urgência": Timer,
  "Surto de Discrição": EyeOff,
};

export function SurgePickerModal({
  usada,
  limite,
  dado,
  onEscolher,
  onFechar,
}: {
  usada: number;
  limite: number;
  /** Dado do dano psíquico por ponto (ex.: "1d4"). */
  dado: string;
  onEscolher: (tipo: string, pontos: number) => void;
  onFechar: () => void;
}) {
  const restante = Math.max(0, limite - usada);
  const primeiroDisponivel = SURTOS_SOBRECARGA.find((s) => s.custo.min <= restante) ?? SURTOS_SOBRECARGA[0];
  const [nome, setNome] = useState(primeiroDisponivel.nome);
  const [pontosUrgencia, setPontosUrgencia] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const surto = SURTOS_SOBRECARGA.find((s) => s.nome === nome) ?? primeiroDisponivel;
  const maxPontos = Math.min(surto.custo.max, restante);
  const pontos = surto.custo.min === surto.custo.max ? surto.custo.min : Math.min(Math.max(pontosUrgencia, surto.custo.min), Math.max(surto.custo.min, maxPontos));
  const disponivel = surto.custo.min <= restante;
  const depois = Math.min(limite, usada + pontos);
  const chegaAoLimite = disponivel && depois >= limite;
  const Icone = ICONE_SURTO[surto.nome] ?? Zap;
  const nomeCurto = (n: string) => n.replace(/^Surto de /, "");

  return (
    <AuxJanela titulo="Surto de Sobrecarga" onFechar={onFechar} plano cabecalho={<></>}>
      <div className={`hx sx ${oxanium.variable}`} data-limite={chegaAoLimite || undefined}>
        <header className="sx-cab">
          <div className="sx-cab-titulo">
            <h2>Surto de Sobrecarga</h2>
            <span className="sx-k">Ação livre</span>
          </div>
          <div className="sx-trilha" aria-label={`Sobrecarga ${usada} de ${limite}${disponivel ? `, vai a ${depois}` : ""}`}>
            <div className="sx-pips">
              {Array.from({ length: limite }, (_, i) => (
                <span key={i} className="sx-pip" data-estado={i < usada ? "usado" : disponivel && i < depois ? "novo" : "livre"} />
              ))}
            </div>
            <span className="sx-trilha-num">{usada}{disponivel && pontos > 0 && <><i aria-hidden="true">▸</i><b>{depois}</b></>}<small>/{limite}</small></span>
          </div>
          <button type="button" className="sx-fechar" aria-label="Cancelar" onClick={onFechar}><X size={16} aria-hidden="true" /></button>
        </header>

        {restante === 0 ? (
          <p className="sx-cheio">Sobrecarga no limite ({usada}/{limite}). Novos surtos só depois de um descanso longo.</p>
        ) : (
          <div className="sx-corpo">
            <div className="sx-lista" role="listbox" aria-label="Surtos">
              {SURTOS_SOBRECARGA.map((s) => {
                const Ic = ICONE_SURTO[s.nome] ?? Zap;
                const ok = s.custo.min <= restante;
                return (
                  <button key={s.nome} type="button" role="option" aria-selected={s.nome === nome} className="sx-item"
                    data-sel={s.nome === nome || undefined} disabled={!ok || enviando} onClick={() => setNome(s.nome)}
                    title={ok ? undefined : "Passaria do limite de Sobrecarga"}>
                    <Ic size={16} aria-hidden="true" />
                    <span className="sx-item-nome">{nomeCurto(s.nome)}</span>
                    <span className="sx-custo">{s.custo.min === s.custo.max ? s.custo.min : `${s.custo.min}–${s.custo.max}`}</span>
                  </button>
                );
              })}
            </div>

            <section className="sx-detalhe" aria-live="polite">
              <div className="sx-detalhe-cab">
                <span className="sx-icone"><Icone size={26} aria-hidden="true" /></span>
                <div>
                  <span className="sx-k">{surto.custo.min === surto.custo.max ? `${surto.custo.min} Sobrecarga` : `${surto.custo.min} a ${surto.custo.max} Sobrecargas`}</span>
                  <h3>{nomeCurto(surto.nome)}</h3>
                </div>
              </div>
              <p className="sx-efeito">{surto.efeito}</p>
              <p className="sx-quando">{surto.quando}</p>

              {surto.custo.max > surto.custo.min && (
                <div className="sx-pontos">
                  <span className="sx-k">Pontos (−PA na magia)</span>
                  <div className="hx-passo hx-passo--ambar">
                    <button type="button" aria-label="Menos um ponto" disabled={pontos <= surto.custo.min} onClick={() => setPontosUrgencia(pontos - 1)}>−</button>
                    <span>{pontos}</span>
                    <button type="button" aria-label="Mais um ponto" disabled={pontos >= maxPontos} onClick={() => setPontosUrgencia(pontos + 1)}>+</button>
                  </div>
                </div>
              )}

              <dl className="sx-preco">
                <div><dt>Sobrecarga</dt><dd>+{pontos}</dd></div>
                <div><dt>Dano psíquico</dt><dd>{pontos > 1 ? `${pontos} × ${dado}` : dado} <small>em PE</small></dd></div>
              </dl>
              {chegaAoLimite && (
                <div className="sx-aviso" role="note">
                  <TriangleAlert size={16} aria-hidden="true" />
                  <span>Alcança o limite: teste de Vontade CD 7 (falha: Atordoado por 1 rodada) e uma <b>Ruptura</b>, resolvida na aba Ruptura.</span>
                </div>
              )}
            </section>
          </div>
        )}

        <footer className="sx-rodape">
          <button type="button" className="sx-btn sx-btn--sec" onClick={onFechar} disabled={enviando}>Cancelar</button>
          {restante > 0 && (
            <button type="button" className="sx-btn sx-btn--pri" disabled={!disponivel || enviando} data-testid="surto-liberar"
              onClick={() => {
                if (enviando || !disponivel) return;
                setEnviando(true);
                onEscolher(surto.nome, pontos);
              }}>
              Liberar {nomeCurto(surto.nome)}
            </button>
          )}
        </footer>
      </div>
    </AuxJanela>
  );
}

export const TIPOS_DEFESA = ["esquivar", "bloquear", "aparar", "resistir"] as const;
export type TipoDefesa = (typeof TIPOS_DEFESA)[number];
const LABEL_DEFESA: Record<TipoDefesa, string> = {
  esquivar: "Esquivar",
  bloquear: "Bloquear",
  aparar: "Aparar",
  resistir: "Resistir",
};

/**
 * Rolar defesa (botão de Reações) — RUPTURA 1.2, "Ações defensivas".
 * Esquivar e Bloquear testam Reflexos, Aparar testa Luta e Resistir
 * testa Vigor ou Mobilidade (o narrador indica qual; a escolha fica
 * aqui mesmo). Toda defesa custa 1 Reação; sem Reação ela acontece com
 * desvantagem cumulativa. Requisitos (arma com Aparar, escudo
 * empunhado) avisam, nunca travam. Teclas 1–3 rolam direto; 4 escolhe
 * Resistir.
 */
const DEFESAS: Record<TipoDefesa, { nome: string; pericias: string[]; contra: string; critico: string; Icone: typeof Zap }> = {
  esquivar: { nome: "Esquivar", pericias: ["reflexos"], contra: "Ataques, magias de área, armadilhas e perigos físicos que dá para evitar.", critico: "Reposicione-se 1 metro imediatamente.", Icone: Wind },
  bloquear: { nome: "Bloquear", pericias: ["reflexos"], contra: "Um ataque contra você ou um aliado adjacente. O dano vai para os PD da proteção.", critico: "Reduza em 1d4 o dano aplicado aos PD da proteção.", Icone: Shield },
  aparar: { nome: "Aparar", pericias: ["luta"], contra: "Um ataque corpo a corpo, desviado com a arma.", critico: "O atacante fica exposto por 1 turno (−1 nas defesas contra você) e seu próximo ataque causa +1d4.", Icone: Swords },
  resistir: { nome: "Resistir", pericias: ["vigor", "mobilidade"], contra: "Ser deslocado, derrubado, arrastado ou imobilizado.", critico: "+1 de vantagem no próximo teste de Corpo até o fim do próximo turno.", Icone: Anchor },
};
const NOME_PERICIA: Record<string, string> = { reflexos: "Reflexos", luta: "Luta", vigor: "Vigor", mobilidade: "Mobilidade" };

function requisitoDaDefesa(tipo: TipoDefesa, api: ConsoleApi): string | null {
  const prontos = (api.character.inventario ?? []).filter((i) => i.estado === "empunhado" || i.estado === "equipado");
  if (tipo === "bloquear") return prontos.some((i) => i.categoria === "escudo") ? null : "Você não empunha escudo ou proteção";
  if (tipo === "aparar") {
    const temAparar = prontos.some((i) => i.categoria === "arma"
      && deriveItemProperties({ instance: i, item: api.catalogo.get(i.itemSlug), properties: [] }).some((p) => p.key === "aparar"));
    return temAparar ? null : "Sua arma empunhada não tem a propriedade Aparar";
  }
  return null;
}

export function DefensePickerModal({ api, onEscolher, onFechar }: {
  api: ConsoleApi;
  onEscolher: (tipo: TipoDefesa, periciaResistir?: "vigor" | "mobilidade") => void;
  onFechar: () => void;
}) {
  const [selecionada, setSelecionada] = useState<TipoDefesa>("esquivar");
  const [resistirCom, setResistirCom] = useState<"vigor" | "mobilidade">("vigor");
  const reacoesMax = api.derivados.reacoes_por_rodada ?? 0;
  const reacoesUsadas = api.character.estado_jogo?.reacoes_usadas ?? 0;
  const restantes = Math.max(0, reacoesMax - reacoesUsadas);
  const penalidade = restantes > 0 ? 0 : (api.character.estado_jogo?.defesas_sem_reacao ?? 0) + 1;

  useEffect(() => {
    function escolherPorAtalho(event: KeyboardEvent) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const alvo = event.target;
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement) return;
      const tipo = TIPOS_DEFESA[Number(event.key) - 1];
      if (!tipo) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (tipo === "resistir") setSelecionada("resistir");
      else onEscolher(tipo);
    }
    window.addEventListener("keydown", escolherPorAtalho, true);
    return () => window.removeEventListener("keydown", escolherPorAtalho, true);
  }, [onEscolher]);

  const def = DEFESAS[selecionada];
  const periciaRolada = selecionada === "resistir" ? resistirCom : def.pericias[0];
  const valorPericia = (id: string) => api.character.pericias?.[id] ?? 0;

  return (
    <AuxJanela titulo="Rolar defesa" onFechar={onFechar} plano cabecalho={<></>}>
      <div className={`hx sx df ${oxanium.variable}`}>
        <header className="sx-cab">
          <div className="sx-cab-titulo">
            <h2>Rolar defesa</h2>
            <span className="sx-k">Custa 1 Reação</span>
          </div>
          <div className="df-reacoes" aria-label={`Reações: ${restantes} de ${reacoesMax}`}>
            <div className="df-losangos">
              {Array.from({ length: reacoesMax }, (_, i) => <i key={i} data-cheio={i < restantes || undefined} />)}
            </div>
            <span className="sx-trilha-num">{restantes}<small>/{reacoesMax}</small></span>
          </div>
          <button type="button" className="sx-fechar" aria-label="Cancelar" onClick={onFechar}><X size={16} aria-hidden="true" /></button>
        </header>

        <div className="df-corpo">
          <div className="df-grade" role="listbox" aria-label="Defesas">
            {TIPOS_DEFESA.map((tipo) => {
              const d = DEFESAS[tipo];
              const aviso = requisitoDaDefesa(tipo, api);
              return (
                <button key={tipo} type="button" role="option" aria-selected={selecionada === tipo} className="df-card" data-sel={selecionada === tipo || undefined}
                  onClick={() => setSelecionada(tipo)} onDoubleClick={() => tipo !== "resistir" && onEscolher(tipo)}>
                  <span className="df-icone"><d.Icone size={20} aria-hidden="true" /></span>
                  <span className="df-card-txt">
                    <span className="df-nome">{d.nome}</span>
                    <span className="df-pericia">{d.pericias.map((p) => `${NOME_PERICIA[p]} ${valorPericia(p)}`).join(" · ")}</span>
                  </span>
                  {aviso && <span className="df-aviso-dot" title={aviso} aria-label={aviso}><TriangleAlert size={14} aria-hidden="true" /></span>}
                </button>
              );
            })}
          </div>

          <section className="df-detalhe" aria-live="polite">
            {selecionada === "resistir" && (
              <div className="df-escolha" role="radiogroup" aria-label="Resistir com">
                {(["vigor", "mobilidade"] as const).map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={resistirCom === p} className="df-opcao" data-sel={resistirCom === p || undefined} onClick={() => setResistirCom(p)}>
                    <b>{NOME_PERICIA[p]} {valorPericia(p)}</b>
                    <small>{p === "vigor" ? "Firmeza: suportar o impacto" : "Agilidade: sair do efeito"}</small>
                  </button>
                ))}
              </div>
            )}
            <dl className="df-linhas">
              <div><dt>Contra</dt><dd>{def.contra}</dd></div>
              <div><dt>Teste</dt><dd className="df-teste"><span className="df-badge">{NOME_PERICIA[periciaRolada]} <b>{valorPericia(periciaRolada)}</b></span><span className="df-vs">contra o valor do ataque</span></dd></div>
              <div><dt>Crítico +5</dt><dd>{def.critico}</dd></div>
            </dl>
            {requisitoDaDefesa(selecionada, api) && (
              <div className="df-alerta"><TriangleAlert size={14} aria-hidden="true" /><span>{requisitoDaDefesa(selecionada, api)}.</span></div>
            )}
            {penalidade > 0 && (
              <div className="df-alerta df-alerta--perigo"><TriangleAlert size={14} aria-hidden="true" /><span>Sem Reação nesta rodada: −{penalidade} de desvantagem.</span></div>
            )}
          </section>
        </div>

        <footer className="sx-rodape">
          <button type="button" className="sx-btn sx-btn--sec" onClick={onFechar}>Cancelar</button>
          <button type="button" className="sx-btn sx-btn--pri" data-testid="defesa-rolar"
            onClick={() => onEscolher(selecionada, selecionada === "resistir" ? resistirCom : undefined)}>
            Rolar {selecionada === "resistir" ? NOME_PERICIA[periciaRolada] : def.nome}
          </button>
        </footer>
      </div>
    </AuxJanela>
  );
}

/** Segundo passo de Resistir: escolhe a perícia antes de abrir a rolagem. */
export function ResistirAtributoModal({
  onEscolher,
  onFechar,
}: {
  onEscolher: (periciaId: "vigor" | "mobilidade") => void;
  onFechar: () => void;
}) {
  return (
    <ConsolePicker
      titulo="Resistir"
      id="ID://DEFESA"
      modulo="MOD.DEFENSE // 05"
      onFechar={onFechar}
    >
      <div className="rc-picker-grade" data-colunas="1">
        <PickerOption
          indice={0}
          nome="Vigor (robustez, suportar impacto ou pressão física)"
          selecionado={false}
          mostrarMarca={false}
          onClick={() => onEscolher("vigor")}
        />
        <PickerOption
          indice={1}
          nome="Mobilidade (maleabilidade, evitar o efeito com agilidade)"
          selecionado={false}
          mostrarMarca={false}
          onClick={() => onEscolher("mobilidade")}
        />
      </div>
    </ConsolePicker>
  );
}

/** Mochila filtrada por slot — só itens compatíveis, nunca lista genérica. */
export function BackpackPickerModal({
  slot,
  itens,
  catalogo,
  onEquipar,
  onFechar,
}: {
  slot: BodySlotId;
  itens: InventoryItemInstance[];
  catalogo: Map<string, ItemContent>;
  onEquipar: (instanceId: string) => void;
  onFechar: () => void;
}) {
  return (
    <AuxJanela titulo={`Mochila — ${BODY_SLOT_LABELS[slot]}`} onFechar={onFechar}>
      {itens.length === 0 ? (
        <p className="rc-vazio">Nenhum item compatível com este slot na mochila.</p>
      ) : (
        <div className="rc-aux-lista">
          {itens.map((i) => {
            const m = catalogo.get(i.itemSlug);
            return (
              <button key={i.id} type="button" className="rc-aux-item" onClick={() => onEquipar(i.id)}>
                <span>{i.itemNome}</span>
                <span className="rc-num">
                  {m?.danoBase ?? (m?.mitMax != null ? `MIT ${m.mitMax}` : m?.pdMax != null ? `PD ${m.pdMax}` : "")}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </AuxJanela>
  );
}

/** Janela de ataque — placeholder ligado aos dados reais da arma. */
/**
 * JANELA DA ARMA — o que abre ao clicar num slot de arma equipada.
 *
 * Duas vistas dentro da MESMA janela (a do Console, `Aux`, a mesma de
 * Condições e de Rolar defesa — nada de uma moldura nova):
 *
 *   FICHA    identidade, trilho de dados (perícia, dano, tipo) e as
 *            ações — rolar ataque abre o Painel de Rolagem prefilhado,
 *            que é por onde TODA rolagem do Console passa.
 *   TROCAR   as armas compatíveis que estão na mochila, mais a saída
 *            "remover do slot".
 *
 * Trocar de arma sem fechar e reabrir é o ponto: o slot de arma é o
 * lugar onde se troca de arma, e antes era preciso desequipar num
 * canto para equipar no outro.
 */
export function AttackModal({
  instancia,
  modelo,
  slot,
  api,
  onRolarPericia,
  onFechar,
}: {
  instancia: InventoryItemInstance;
  modelo: ItemContent;
  slot: BodySlotId;
  api: ConsoleApi;
  /** Abre o Painel de Rolagem com a perícia de ataque já escolhida. */
  onRolarPericia: (periciaId: string) => void;
  onFechar: () => void;
}) {
  const [trocando, setTrocando] = useState(false);
  const candidatos = itensCompativeisComSlot(api.character.inventario ?? [], api.catalogo, slot);
  const dano = [modelo.danoBase, modelo.subtipoDano ?? modelo.tipoDano].filter(Boolean).join(" ");
  const rotuloSlot = slot === "arma_primaria" ? "Arma primária" : "Arma secundária";

  return (
    <AuxJanela
      titulo={`${instancia.itemNome} — ${rotuloSlot}`}
      onFechar={onFechar}
      plano
      cabecalho={
        <div className="rc-arma-cab">
          <span className="rc-arma-cab-id">
            WEAPON://<b>{instancia.itemNome}</b>
          </span>
          <button
            type="button"
            className="rc-arma-swap"
            data-ativo={trocando || undefined}
            onClick={() => setTrocando((v) => !v)}
          >
            {trocando ? "Voltar" : "Trocar"}
          </button>
          <button type="button" className="rc-arma-fechar" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>
      }
    >

      {!trocando ? (
        <>
          <div className="rc-arma-ident">
            <div>
              <div className="rc-arma-nome">{instancia.itemNome}</div>
              <div className="rc-arma-sub">{[modelo.categoria, modelo.raridade].filter(Boolean).join(" // ")}</div>
            </div>
            {modelo.propertySlugs.length > 0 && (
              <span className="rc-arma-tag">{modelo.propertySlugs.join(" · ")}</span>
            )}
          </div>

          <div className="rc-arma-trilho">
            <div className="rc-arma-celula">
              <span className="rc-arma-rotulo">Perícia</span>
              <span className="rc-arma-valor">{modelo.periciaAtaque ?? "—"}</span>
            </div>
            <div className="rc-arma-celula">
              <span className="rc-arma-rotulo">Dano</span>
              <span className="rc-arma-valor">{dano || "—"}</span>
            </div>
            <div className="rc-arma-celula">
              <span className="rc-arma-rotulo">Tipo</span>
              <span className="rc-arma-valor">{modelo.subtipoDano ?? modelo.tipoDano ?? "—"}</span>
            </div>
          </div>

          <div className="rc-arma-acoes">
            <button
              type="button"
              className="rc-arma-acao rc-arma-acao--primaria"
              disabled={!modelo.periciaAtaque}
              onClick={() => modelo.periciaAtaque && onRolarPericia(modelo.periciaAtaque)}
            >
              <span className="rc-arma-acao-titulo">Rolar ataque</span>
              <span className="rc-arma-acao-meta">
                {modelo.periciaAtaque ? `Teste de ${modelo.periciaAtaque}` : "Sem perícia de ataque"}
              </span>
            </button>
            {/* O DANO é leitura, não botão: o Console só sabe rolar
                atributo, perícia e defesa — não existe rolagem de
                expressão de dano no motor, e um botão que abrisse o
                painel com a perícia no lugar do dano prometeria uma
                coisa e faria outra. */}
            <div className="rc-arma-acao rc-arma-acao--dado">
              <span className="rc-arma-acao-titulo">{dano || "—"}</span>
              <span className="rc-arma-acao-meta">Dano do golpe</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="rc-arma-lista">
            <div className="rc-arma-opcao" data-atual="true">
              <span className="rc-arma-opcao-info">
                <span className="rc-arma-opcao-nome">{instancia.itemNome}</span>
                <span className="rc-arma-opcao-meta">Equipado</span>
              </span>
              <button type="button" className="rc-arma-equipar" disabled>
                Atual
              </button>
            </div>
            {candidatos.map((cand) => {
              const m = api.catalogo.get(cand.itemSlug);
              return (
                <div className="rc-arma-opcao" key={cand.id}>
                  <span className="rc-arma-opcao-info">
                    <span className="rc-arma-opcao-nome">{cand.itemNome}</span>
                    <span className="rc-arma-opcao-meta">
                      {[m?.danoBase, m?.subtipoDano ?? m?.tipoDano].filter(Boolean).join(" ") || "Na mochila"}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="rc-arma-equipar"
                    onClick={() => {
                      api.equiparNoSlot(cand.id, slot);
                      onFechar();
                    }}
                  >
                    Equipar
                  </button>
                </div>
              );
            })}
            {candidatos.length === 0 && <p className="rc-vazio">Nenhuma arma compatível na mochila.</p>}
          </div>
          <div className="rc-arma-remover">
            <button
              type="button"
              className="rc-arma-desequipar"
              onClick={() => {
                api.desequipar(instancia.id);
                onFechar();
              }}
            >
              Remover do slot
            </button>
          </div>
        </>
      )}
    </AuxJanela>
  );
}

/** Confirmação de recarga. */
export function ConfirmModal({
  titulo,
  mensagem,
  onConfirmar,
  onFechar,
}: {
  titulo: string;
  mensagem: string;
  onConfirmar: () => void;
  onFechar: () => void;
}) {
  return (
    <AuxJanela titulo={titulo} onFechar={onFechar}>
      <p className="rc-vazio">{mensagem}</p>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Cancelar
        </button>
        <button type="button" className="rc-ghost" onClick={onConfirmar} data-testid="console-confirmar">
          Confirmar
        </button>
      </div>
    </AuxJanela>
  );
}

/**
 * Adicionar condição — as condições publicadas na Biblioteca (nenhuma
 * lista local no lugar), em medalhões agrupados por família, como runas
 * de jogo. Seleção múltipla; condição ativa ganha a fita com o nível
 * (cumulativa já ativa: aplicar de novo agrava, regra do narrador v1.2).
 * Ao clicar numa condição, a faixa acima do rodapé mostra o efeito dela.
 */
export function ConditionPickerModal({
  disponiveis,
  ativas,
  onAplicar,
  onFechar,
}: {
  disponiveis: { slug: string; nome: string; descricao_curta?: string; descricao_longa?: string; tags?: string[]; nivel_maximo?: number; acoes?: { acao: string; custo_pa?: number }[] }[];
  /** Condições ativas no personagem: slug → nível atual. */
  ativas: Map<string, number>;
  onAplicar: (condicoes: { slug: string; nome: string }[]) => void;
  onFechar: () => void;
}) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set());
  const [foco, setFoco] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const total = selecionadas.size;
  const porSlug = new Map(disponiveis.map((c) => [c.slug, c]));
  const conhecidas = new Set<string>(FAMILIAS_CONDICAO.flatMap((f) => [...f.slugs]));
  const grupos = [
    ...FAMILIAS_CONDICAO.map((f) => ({ ...f, itens: f.slugs.map((s) => porSlug.get(s)).filter((c): c is NonNullable<typeof c> => !!c) })),
    { id: "outras", nome: "Outras", cor: "#7f95b3", fundo: "#0b1822", slugs: [] as string[], itens: disponiveis.filter((c) => !conhecidas.has(c.slug)) },
  ].filter((g) => g.itens.length > 0);
  const familiaDe = (slug: string) => grupos.find((g) => g.itens.some((c) => c.slug === slug)) ?? grupos[0];
  const focada = foco ? porSlug.get(foco) : undefined;

  function alternar(slug: string) {
    setSelecionadas((atuais) => {
      const proximas = new Set(atuais);
      if (proximas.has(slug)) proximas.delete(slug);
      else proximas.add(slug);
      return proximas;
    });
  }

  function aplicarSelecionadas() {
    if (aplicando || total === 0) return;
    setAplicando(true);
    onAplicar(disponiveis.filter((c) => selecionadas.has(c.slug)));
  }

  const famFoco = focada ? familiaDe(focada.slug) : undefined;
  const IconeFoco = focada ? ICONE_CONDICAO[focada.slug] ?? CircleAlert : null;

  return (
    <AuxJanela titulo="Adicionar condição" onFechar={onFechar} plano cabecalho={<></>}>
      <div className={`hx sx df cd ${oxanium.variable}`}
        onClick={(e) => { if (!(e.target as Element).closest(".cd-runa, .cd-dica")) setFoco(null); }}>
        <header className="sx-cab">
          <div className="sx-cab-titulo">
            <h2>Adicionar condição</h2>
            <span className="sx-k">{ativas.size === 0 ? "Nenhuma ativa" : ativas.size === 1 ? "1 ativa" : `${ativas.size} ativas`}</span>
          </div>
          <button type="button" className="sx-fechar" aria-label="Fechar" onClick={onFechar}><X size={16} aria-hidden="true" /></button>
        </header>

        {disponiveis.length === 0 ? (
          <p className="sx-cheio">A Biblioteca de condições não está disponível. Nenhuma lista local é usada no lugar.</p>
        ) : (
          <div className="cd-corpo">
            {grupos.map((g) => (
              <section key={g.id} className="cd-familia" style={{ ["--cd-cor" as string]: g.cor, ["--cd-fundo" as string]: g.fundo }}>
                <h3 className="cd-familia-titulo"><i aria-hidden="true" />{g.nome}<span aria-hidden="true" /></h3>
                <div className="cd-runas" role="listbox" aria-multiselectable="true" aria-label={g.nome}>
                  {g.itens.map((c) => {
                    const sel = selecionadas.has(c.slug);
                    const nivel = ativas.get(c.slug);
                    const max = c.nivel_maximo ?? 1;
                    const Ic = ICONE_CONDICAO[c.slug] ?? CircleAlert;
                    return (
                      <button key={c.slug} type="button" role="option" aria-selected={sel} className="cd-runa"
                        data-sel={sel || undefined} data-ativa={nivel != null || undefined}
                        onClick={() => { alternar(c.slug); setFoco(c.slug); }}
                        aria-label={`${c.nome}${nivel != null ? `, ativa${max > 1 ? ` nível ${nivel}` : ""}` : ""}`}>
                        <span className="cd-medalha">
                          <span className="cd-anel" aria-hidden="true" />
                          <Ic size={22} aria-hidden="true" />
                          {nivel != null && <span className="cd-fita">{max > 1 ? `${nivel}/${max}` : "Ativa"}</span>}
                          {sel && <span className="cd-marca" aria-hidden="true"><Check size={10} /></span>}
                        </span>
                        <span className="cd-runa-nome">{c.nome}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {focada && IconeFoco && famFoco && (
          <div className="cd-dica" aria-live="polite" style={{ ["--cd-cor" as string]: famFoco.cor, ["--cd-fundo" as string]: famFoco.fundo }}>
            <span className="cd-dica-icone"><IconeFoco size={18} aria-hidden="true" /></span>
            <span className="cd-dica-txt">
              <b>{focada.nome}{(focada.nivel_maximo ?? 1) > 1 && <small> · cumulativa até {focada.nivel_maximo}</small>}</b>
              <span>{focada.descricao_curta ?? "Sem descrição na Biblioteca."}</span>
            </span>
          </div>
        )}

        <footer className="sx-rodape">
          <span className="cd-resumo">{total === 0 ? "Nenhuma selecionada" : disponiveis.filter((c) => selecionadas.has(c.slug)).map((c) => c.nome).join(", ")}</span>
          <button type="button" className="sx-btn sx-btn--sec" onClick={onFechar}>Cancelar</button>
          <button type="button" className="sx-btn sx-btn--pri" disabled={total === 0 || aplicando} onClick={aplicarSelecionadas} data-testid="condicao-aplicar">
            Aplicar{total > 1 ? ` ${total}` : ""}
          </button>
        </footer>
      </div>
    </AuxJanela>
  );
}
