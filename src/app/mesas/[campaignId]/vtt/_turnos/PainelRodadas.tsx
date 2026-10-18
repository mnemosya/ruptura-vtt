"use client";

/**
 * Janela de COMBATE (ferramenta "Rodadas") — linha F.
 *
 * Dois estados, uma janela:
 *   · PREPARO (sem trilha): quem entra, modo, e "Iniciar rodadas".
 *   · ATIVO (com trilha): a rodada, a janela em resolução, e QUEM está
 *     no combate — com a declaração de cada um e um jeito de achá-lo no
 *     mapa.
 *
 * O que esta janela deliberadamente NÃO faz: destacar "quem está agindo
 * agora". No Ruptura o que orienta a mesa é a rodada e a janela
 * (Rápidos/Lentos); a ativação aberta já é da trilha (`TrilhaFaccoes`),
 * que continua sendo onde se assume, conclui e avança janela/rodada.
 * Repetir isso aqui criaria dois lugares dizendo a mesma coisa.
 *
 * Nada aqui decide regra de combate. Declarar passa pelo `declarar` do
 * modelo (via `onDeclarar`), as edições de elenco pelas transições de
 * administração, e o travamento da declaração espelha o do modelo.
 */

import { useMemo, useState } from "react";
import { ChevronDown, Eye, EyeOff, Loader2, Swords, UserPlus } from "lucide-react";
import { JanelaFerramenta } from "../_shell/JanelaFerramenta";
import {
  type EstadoTrilha, type Janela, type Lado, type ModoCena, type Participante,
  PISO_PA, ROTULO_JANELA_CURTO, ROTULO_LADO, TETO_PA, paRestante,
} from "./modelo";
import type { TokenApresentacao } from "../_dominio/tokenApresentacao";

/**
 * Modos que a trilha realmente usa. "tregua" suspende a contagem e
 * "exploracao" é a ausência de combate — oferecê-los como forma de
 * INICIAR rodadas seria um botão que se contradiz.
 */
const MODOS_INICIAIS: { id: ModoCena; rotulo: string; dica: string }[] = [
  { id: "combate", rotulo: "Combate padrão", dica: "Rodada normal: as jogadas alternam entre os dois lados." },
  { id: "emboscada", rotulo: "Emboscada", dica: "Rodada surpresa: o lado que emboscou age inteiro, só com turnos rápidos." },
];

/** Ciclo da declaração na linha: nenhuma → rápido → lento → nenhuma. */
const CICLO: (Janela | null)[] = [null, "rapidos", "lentos"];
const DECL_TXT: Record<Janela, string> = { rapidos: "Rápido", lentos: "Lento" };

export interface PainelRodadasProps {
  ehNarrador: boolean;
  /** Tokens da cena, candidatos a participante. */
  tokens: readonly TokenApresentacao[];
  /** `null` = nenhuma rodada em andamento nesta cena. */
  trilha: EstadoTrilha | null;
  /** Trilha escondida só pra este usuário (não altera o combate de ninguém). */
  oculta: boolean;
  /** Alguma escrita em voo — desabilita o que não pode ser clicado duas vezes. */
  ocupado: boolean;
  erro: string | null;
  onIniciar: (params: { tokenIds: string[]; modo: ModoCena; ladoSurpresa: Lado | null }) => void;
  onEncerrar: () => void;
  onAdicionar: (tokenIds: string[]) => void;
  onRemover: (id: string) => void;
  onAlternarIncapaz: (id: string, incapaz: boolean) => void;
  onEncerrarParticipacao: (id: string) => void;
  onAlternarOculta: () => void;
  onFechar: () => void;
  /** Acha o token no mapa (seleciona e centraliza). Sem ele, a mira some. */
  onLocalizar?: (tokenId: string) => void;
  /**
   * Declara a janela do participante; `null` tira a declaração. Sem
   * ele, a declaração aparece só para leitura.
   */
  onDeclarar?: (participanteId: string, janela: Janela | null) => void;
  /** Quem pode declarar por este participante. Padrão: só o narrador. */
  podeComandar?: (participanteId: string) => boolean;
}

/** Handlers da frase de ajuda (`jf-desc`): mouse E teclado. */
function ajudaCom(set: (t: string | null) => void) {
  return (texto: string, aoSair: string | null = null) => ({
    onMouseEnter: () => set(texto),
    onMouseLeave: () => set(aoSair),
    onFocus: () => set(texto),
    onBlur: () => set(aoSair),
  });
}

const Mira = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="6.5" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </svg>
);
const Mais = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
  </svg>
);

function Disco({ token, lado }: { token: TokenApresentacao | undefined; lado: Lado }) {
  return (
    <span className="jf-disco" data-lado={lado} aria-hidden="true">
      {token?.retrato ? <img src={token.retrato} alt="" /> : (token?.sigla ?? "??")}
    </span>
  );
}

export function PainelRodadas(props: PainelRodadasProps) {
  return (
    <JanelaFerramenta
      id="rodadas"
      largura="gestao"
      icone={<Swords size={16} />}
      titulo="Combate"
      modo={props.trilha ? "Ativo" : props.ehNarrador ? "Preparando" : "Sem combate"}
      rotulo="Ferramenta Rodadas"
      rotuloFechar="Fechar painel de Rodadas"
      aoFechar={props.onFechar}
      className="rv-fp--rodadas"
      atributos={{ "data-fase": props.trilha ? "ativo" : "preparo" }}
      testId="painel-rodadas"
    >
      <div className="rv-fp-corpo jfc-corpo">
        {props.erro && <p className="jfc-erro" role="alert">{props.erro}</p>}
        {props.trilha
          ? <Administracao {...props} trilha={props.trilha} />
          : <Configuracao {...props} />}
      </div>
    </JanelaFerramenta>
  );
}

/* ══════════════════ PREPARO ══════════════════ */

function Configuracao({ ehNarrador, tokens, ocupado, onIniciar, onLocalizar }: PainelRodadasProps) {
  // Começa com TODO MUNDO dentro: montar o combate com o elenco inteiro
  // é o caso comum, e tirar dois é menos trabalho que pôr oito.
  const [escolhidos, setEscolhidos] = useState<Set<string>>(() => new Set(tokens.map((t) => t.id)));
  const [modo, setModo] = useState<ModoCena>("combate");
  const [ladoSurpresa, setLadoSurpresa] = useState<Lado | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const ajuda = ajudaCom(setFoco);

  const dentro = tokens.filter((t) => escolhidos.has(t.id));
  const pj = dentro.filter((t) => t.lado === "pj");
  const pn = dentro.filter((t) => t.lado !== "pj"); // neutro conta como narrador, como em `participanteDeToken`
  const total = dentro.length;

  const alternar = (id: string) => setEscolhidos((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  if (!ehNarrador) {
    return <p className="jfc-msg">Não há rodadas em andamento nesta cena. Só o narrador inicia o combate.</p>;
  }
  if (tokens.length === 0) {
    return (
      <p className="jfc-msg">
        Esta cena ainda não tem nenhum token. Adicione personagens ao mapa (ferramenta de token, na barra
        lateral) e volte aqui para montar o combate.
      </p>
    );
  }

  const impedimento = total === 0 ? "Escolha pelo menos um participante."
    : modo === "emboscada" && ladoSurpresa === null ? "Escolha qual lado surpreendeu."
    : null;
  const dicaModo = MODOS_INICIAIS.find((m) => m.id === modo)!.dica;

  return (
    <>
      {/* Vitrine: os dois lados que vão se enfrentar. */}
      <div className="jf-hero jfc-placar" data-testid="rodadas-placar">
        <LadoPlacar lado="pj" n={pj.length} />
        <span className="jfc-vs" aria-hidden="true">VS</span>
        <LadoPlacar lado="pn" n={pn.length} dir />
      </div>

      <div className="jf-grupo">
        <span className="jf-rot">
          <span id="jfc-rot-quem">Quem entra <span className="jfc-conta"><b data-testid="rodadas-conta-total">{total}</b> de {tokens.length}</span></span>
          <span className="jfc-rot-acoes">
            <button type="button" onClick={() => setEscolhidos(new Set(tokens.map((t) => t.id)))}>Todos</button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={() => setEscolhidos(new Set())}>Nenhum</button>
          </span>
        </span>
        <div className="jf-lista" role="group" aria-labelledby="jfc-rot-quem">
          {tokens.map((t) => {
            const den = escolhidos.has(t.id);
            const lado: Lado = t.lado === "pj" ? "pj" : "pn";
            const texto = den ? `Tirar ${t.nome} do combate` : `Colocar ${t.nome} no combate`;
            return (
              // A linha inteira põe/tira (mouse); o losango é o controle
              // de teclado e leitor de tela — botão dentro de botão não pode.
              <div key={t.id} className={`jf-item jfc-part${den ? "" : " is-fora"}`} data-lado={lado}
                data-testid={`rodadas-quem-${t.id}`} onClick={() => alternar(t.id)} {...ajuda(texto)}>
                <button type="button" className="jfc-marca" role="checkbox" aria-checked={den} aria-label={texto}
                  onClick={(e) => { e.stopPropagation(); alternar(t.id); }}><i /></button>
                <Disco token={t} lado={lado} />
                <span className="jf-item-txt">
                  <span className="jf-item-nome">{t.nome}</span>
                  {!t.visivel && <span className="jf-item-sub">oculto dos jogadores</span>}
                </span>
                <span className="jfc-ladov">{lado === "pj" ? "PJ" : "PN"}</span>
                {onLocalizar && (
                  <span className="jf-acts">
                    <button type="button" className="jf-mini" aria-label={`Achar ${t.nome} no mapa`}
                      data-testid={`rodadas-localizar-${t.id}`}
                      onClick={(e) => { e.stopPropagation(); onLocalizar(t.id); }}
                      {...ajuda(`Achar ${t.nome} no mapa`, texto)}><Mira /></button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="jf-grupo">
        <span className="jf-rot" id="jfc-rot-modo">Modo</span>
        <div className="jf-tiles" role="radiogroup" aria-labelledby="jfc-rot-modo">
          {MODOS_INICIAIS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={modo === m.id} className="jf-tile"
              data-testid={`rodadas-modo-${m.id}`}
              onClick={() => { setModo(m.id); if (m.id !== "emboscada") setLadoSurpresa(null); }}
              {...ajuda(m.dica)}>
              {m.rotulo}
            </button>
          ))}
        </div>
        {modo === "emboscada" && (
          <>
            <span className="jf-rot jfc-rot-surpresa" id="jfc-rot-surpresa">Quem emboscou</span>
            <div className="jf-tiles jfc-surpresa" role="radiogroup" aria-labelledby="jfc-rot-surpresa">
              {(["pj", "pn"] as Lado[]).map((lado) => (
                <button key={lado} type="button" role="radio" aria-checked={ladoSurpresa === lado}
                  className="jf-tile" data-lado={lado} data-testid={`rodadas-surpresa-${lado}`}
                  onClick={() => setLadoSurpresa(lado)}>
                  <span className="jf-ponto" aria-hidden="true" />{ROTULO_LADO[lado]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <p className="jf-desc">{foco ?? dicaModo}</p>

      <div className="jfc-prim-caixa">
        <button type="button" className="jf-prim" data-testid="rodadas-iniciar"
          disabled={impedimento !== null || ocupado}
          onClick={() => onIniciar({ tokenIds: dentro.map((t) => t.id), modo, ladoSurpresa })}>
          {ocupado ? <><Loader2 size={13} className="rv-girando" /> Iniciando…</> : "Iniciar rodadas"}
        </button>
      </div>
      {impedimento && <p className="jf-nota" role="status" data-testid="rodadas-aviso">{impedimento}</p>}
    </>
  );
}

function LadoPlacar({ lado, n, dir }: { lado: Lado; n: number; dir?: boolean }) {
  // Fileira curta: passa de 8, vira "+N" — a vitrine é um placar, não a lista.
  const MAX = 8;
  return (
    <div className={`jfc-lado${dir ? " jfc-lado--dir" : ""}`} data-lado={lado}>
      <span className="jf-rot">{ROTULO_LADO[lado]}</span>
      <b>{n}</b>
      <span className="jfc-discos" aria-hidden="true">
        {Array.from({ length: Math.min(n, MAX) }, (_, i) => <i key={i} />)}
        {n > MAX && <small>+{n - MAX}</small>}
      </span>
    </div>
  );
}

/* ══════════════════ COMBATE ATIVO ══════════════════ */

type Filtro = Janela | "sem" | null;

function Administracao({
  trilha, tokens, ehNarrador, oculta, ocupado,
  onEncerrar, onAdicionar, onRemover, onAlternarIncapaz, onEncerrarParticipacao, onAlternarOculta,
  onLocalizar, onDeclarar, podeComandar,
}: PainelRodadasProps & { trilha: EstadoTrilha }) {
  const [confirmando, setConfirmando] = useState<null | { tipo: "encerrar" } | { tipo: "remover"; id: string }>(null);
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [foraAberto, setForaAberto] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  const ajuda = ajudaCom(setFoco);

  const tokenPorId = useMemo(() => new Map(tokens.map((t) => [t.id, t])), [tokens]);
  const idsNaTrilha = new Set(trilha.participantes.map((p) => p.id));
  const forasteiros = tokens.filter((t) => !idsNaTrilha.has(t.id));
  const agindo = trilha.participantes.find((p) => p.id === trilha.agindoId) ?? null;
  const rapidos = trilha.janela === "rapidos";

  const conta = (d: Janela | null) => trilha.participantes.filter((p) => p.declaracao === d).length;
  const FILTROS: { id: Exclude<Filtro, null>; nome: string; n: number; dica: string }[] = [
    { id: "rapidos", nome: "Rápidos", n: conta("rapidos"), dica: "Mostrar só quem declarou rápidos" },
    { id: "lentos", nome: "Lentos", n: conta("lentos"), dica: "Mostrar só quem declarou lentos" },
    { id: "sem", nome: "Sem declaração", n: conta(null), dica: "Mostrar só quem não declarou" },
  ];
  const visiveis = trilha.participantes.filter((p) =>
    filtro === null || (filtro === "sem" ? p.declaracao === null : p.declaracao === filtro));

  const regra = (rapidos
    ? `até ${TETO_PA.rapidos} PA · agem antes dos lentos`
    : `${PISO_PA.lentos} PA ou mais · agem depois`)
    + (trilha.modo === "emboscada" && trilha.ladoSurpresa ? ` · emboscada de ${trilha.ladoSurpresa === "pj" ? "PJ" : "PN"}` : "");

  const remover = (p: Participante) => {
    setAberto(null);
    // Tirar quem está com o turno aberto derruba a ativação — isso
    // precisa ser dito, não descoberto depois.
    if (trilha.agindoId === p.id) setConfirmando({ tipo: "remover", id: p.id });
    else onRemover(p.id);
  };

  return (
    <>
      {/* Vitrine: a rodada e a janela em resolução, na cor dela. */}
      <div className="jf-hero jfc-hero" data-janela={trilha.janela} data-testid="rodadas-vitrine">
        <div className="jfc-topo">
          <div className="jfc-rod"><span className="jf-rot">Rodada</span><b data-testid="rodadas-rodada">{trilha.rodada}</b></div>
          <div className="jfc-jan">
            <span className="jf-rot">Em resolução</span>
            <b data-testid="rodadas-janela">{ROTULO_JANELA_CURTO[trilha.janela]}</b>
            <span className="jfc-regra">{regra}</span>
          </div>
        </div>
        <div className="jfc-fases" aria-hidden="true">
          <span className="jfc-fase" data-janela="rapidos" data-estado={rapidos ? "agora" : "feita"}>Rápidos</span>
          <span className="jfc-fase" data-janela="lentos" data-estado={rapidos ? "" : "agora"}>Lentos</span>
        </div>
      </div>

      {/* Abas SEM "Todos": clicar na ativa de novo volta a mostrar todos. */}
      <div className="jf-abas jfc-filtros" role="group" aria-label="Filtrar por declaração">
        {FILTROS.map((f) => {
          const on = filtro === f.id;
          return (
            <button key={f.id} type="button" className="jf-aba jfc-filtro" data-filtro={f.id} aria-pressed={on}
              data-testid={`rodadas-filtro-${f.id}`}
              onClick={() => setFiltro(on ? null : f.id)}
              {...ajuda(on ? "Clique de novo pra ver todos" : f.dica)}>
              {f.nome}<b>{f.n}</b>
            </button>
          );
        })}
      </div>

      <div className="jf-lista jfc-lista">
        {visiveis.length === 0 && (
          <div className="jfc-vazio-l">
            {trilha.participantes.length === 0 ? "Ninguém no combate"
              : filtro === "sem" ? "Todos declararam" : "Ninguém declarou essa janela"}
          </div>
        )}
        {visiveis.map((p) => {
          const token = tokenPorId.get(p.id);
          const sumido = !token;
          const restante = paRestante(p);
          const sub = sumido ? "token removido do mapa"
            : p.incapaz ? "incapaz"
            : p.encerrou ? "passou a rodada"
            : p.agiuEm.length > 0 ? (p.fragmentouEm ? "fragmentou" : "já agiu")
            : null;
          const podeLocalizar = !!onLocalizar && !sumido;
          const textoLinha = `${p.nome} · ${restante} de ${p.paTotal} PA${podeLocalizar ? " · clique pra achar no mapa" : ""}`;

          // Espelha o travamento de `declarar` no modelo: quem já resolveu
          // a rodada (sem fragmentação pendente) tem declaração consumada.
          const travada = (p.agiuEm.length > 0 && p.fragmentouEm === null) || !!p.incapaz || p.encerrou || trilha.agindoId === p.id;
          const comanda = !!onDeclarar && (podeComandar ? podeComandar(p.id) : ehNarrador);
          const podeDeclarar = comanda && !travada && !ocupado;
          const prox = CICLO[(CICLO.indexOf(p.declaracao) + 1) % CICLO.length];
          const dicaDecl = !comanda ? `Declaração de ${p.nome}: ${p.declaracao ? DECL_TXT[p.declaracao].toLowerCase() : "nenhuma"}`
            : travada ? "Declaração travada: já resolveu a rodada"
            : `Clique pra trocar: ${prox ? `declarar ${DECL_TXT[prox].toLowerCase()}` : "tirar a declaração"}`;
          const estaAberto = aberto === p.id;

          return (
            <div key={p.id} className="jfc-bloco">
              <div className={`jf-item jfc-part${sumido || p.incapaz || p.encerrou ? " is-fora" : ""}`}
                data-lado={p.lado} data-testid={`rodadas-linha-${p.id}`}
                onClick={() => { if (podeLocalizar) onLocalizar!(p.id); }}
                {...ajuda(textoLinha)}>
                <Disco token={token} lado={p.lado} />
                <span className="jf-item-txt">
                  <span className="jf-item-nome">{p.nome}</span>
                  {sub && <span className="jf-item-sub">{sub}</span>}
                </span>
                <button type="button" className="jfc-decl" data-janela={p.declaracao ?? "nenhuma"}
                  data-testid={`rodadas-declarar-${p.id}`}
                  disabled={!podeDeclarar}
                  aria-label={`Declaração de ${p.nome}: ${p.declaracao ? DECL_TXT[p.declaracao] : "nenhuma"}${podeDeclarar ? ". Trocar" : ""}`}
                  onClick={(e) => { e.stopPropagation(); if (podeDeclarar) onDeclarar!(p.id, prox); }}
                  {...ajuda(dicaDecl, textoLinha)}>
                  <span>{p.declaracao ? DECL_TXT[p.declaracao] : podeDeclarar ? "Declarar" : ""}</span>
                </button>
                <PaLosangos total={p.paTotal} restante={restante} />
                <span className="jf-acts">
                  {onLocalizar && (
                    <button type="button" className="jf-mini" aria-label={`Achar ${p.nome} no mapa`} disabled={sumido}
                      data-testid={`rodadas-localizar-${p.id}`}
                      onClick={(e) => { e.stopPropagation(); onLocalizar(p.id); }}
                      {...ajuda(`Achar ${p.nome} no mapa`, textoLinha)}><Mira /></button>
                  )}
                  {ehNarrador && (
                    <button type="button" className="jf-mini" aria-label={`Mais ações de ${p.nome}`} aria-expanded={estaAberto}
                      aria-controls={`jfc-extra-${p.id}`} data-testid={`rodadas-mais-${p.id}`}
                      onClick={(e) => { e.stopPropagation(); setAberto(estaAberto ? null : p.id); }}
                      {...ajuda("Ações do narrador: incapaz, passar a rodada, remover", textoLinha)}><Mais /></button>
                  )}
                </span>
              </div>
              {ehNarrador && estaAberto && (
                <div className="jfc-extra" id={`jfc-extra-${p.id}`} role="group" aria-label={`Ações de ${p.nome}`}>
                  <button type="button" aria-pressed={!!p.incapaz} disabled={ocupado} data-testid={`rodadas-incapaz-${p.id}`}
                    aria-label={p.incapaz ? `Reverter "incapaz" de ${p.nome}` : `Marcar ${p.nome} como incapaz de agir`}
                    onClick={() => { setAberto(null); onAlternarIncapaz(p.id, !p.incapaz); }}>
                    {p.incapaz ? "Não está incapaz" : "Incapaz"}
                  </button>
                  <button type="button" disabled={ocupado || p.encerrou} data-testid={`rodadas-passar-${p.id}`}
                    aria-label={`Encerrar a participação de ${p.nome} nesta rodada`}
                    onClick={() => { setAberto(null); onEncerrarParticipacao(p.id); }}>
                    {p.encerrou ? "Já passou a rodada" : "Passar a rodada"}
                  </button>
                  <button type="button" className="is-perigo" disabled={ocupado} data-testid={`rodadas-remover-${p.id}`}
                    aria-label={`Remover ${p.nome} das rodadas`} onClick={() => remover(p)}>
                    Remover
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {ehNarrador && forasteiros.length > 0 && (
        <div className="jfc-fora">
          <button type="button" className="jf-sec-cab" aria-expanded={foraAberto} aria-controls="jfc-fora-corpo"
            onClick={() => setForaAberto((v) => !v)}>
            <span className="jf-l">Fora do combate</span>
            <span className="jf-sec-res">{forasteiros.length}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {foraAberto && (
            <div className="jf-sec-corpo" id="jfc-fora-corpo">
              <div className="jf-lista">
                {forasteiros.map((t) => {
                  const lado: Lado = t.lado === "pj" ? "pj" : "pn";
                  return (
                    <div key={t.id} className="jf-item jfc-part" data-lado={lado}
                      onClick={() => onLocalizar?.(t.id)}
                      {...ajuda(onLocalizar ? `${t.nome} · clique pra achar no mapa` : t.nome)}>
                      <Disco token={t} lado={lado} />
                      <span className="jf-item-txt">
                        <span className="jf-item-nome">{t.nome}</span>
                        {!t.visivel && <span className="jf-item-sub">oculto dos jogadores</span>}
                      </span>
                      <span className="jfc-ladov">{lado === "pj" ? "PJ" : "PN"}</span>
                      <span className="jf-acts">
                        <button type="button" className="jf-mini" aria-label={`Adicionar ${t.nome} às rodadas`} disabled={ocupado}
                          data-testid={`rodadas-adicionar-${t.id}`}
                          onClick={(e) => { e.stopPropagation(); onAdicionar([t.id]); }}><UserPlus size={14} /></button>
                      </span>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="jf-quieto jfc-add-todos" disabled={ocupado}
                onClick={() => onAdicionar(forasteiros.map((t) => t.id))}>Adicionar todos</button>
            </div>
          )}
        </div>
      )}

      <p className="jf-desc">{foco ?? (rapidos ? "Quem não declarou ainda pode agir nos rápidos" : "Rápidos resolvidos · agora agem os lentos")}</p>

      {/* Rodapé: encerrar QUIETO à esquerda (atinge a mesa inteira, não
          deve atrair o clique); à direita, ocultar a trilha só pra mim. */}
      <footer className="jfc-rodape">
        {ehNarrador ? (
          <button type="button" className="jf-quieto is-perigo" disabled={ocupado} data-testid="rodadas-encerrar"
            onClick={() => setConfirmando({ tipo: "encerrar" })}>
            Encerrar combate
          </button>
        ) : <span />}
        <button type="button" className="jf-mini" aria-pressed={oculta} data-testid="rodadas-olho"
          aria-label={oculta ? "Mostrar a trilha para mim" : "Ocultar a trilha só para mim"}
          onClick={onAlternarOculta}
          {...ajuda(oculta ? "Mostrar a trilha pra você" : "Ocultar a trilha só pra você — o combate segue pra mesa")}>
          {oculta ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </footer>

      {confirmando?.tipo === "encerrar" && (
        <Confirmacao
          titulo="Encerrar rodadas"
          rotuloConfirmar="Encerrar rodadas"
          ocupado={ocupado}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={() => { setConfirmando(null); onEncerrar(); }}
        >
          <p>
            Encerrando a <strong>rodada {trilha.rodada}</strong>, janela{" "}
            <strong>{ROTULO_JANELA_CURTO[trilha.janela]}</strong>
            {agindo ? <> — com <strong>{agindo.nome}</strong> em ação.</> : "."}
          </p>
          <p>A trilha some <strong>para todos os participantes da mesa</strong>. Os tokens do mapa não são alterados.</p>
        </Confirmacao>
      )}

      {confirmando?.tipo === "remover" && (
        <Confirmacao
          titulo="Remover quem está agindo"
          rotuloConfirmar="Remover mesmo assim"
          ocupado={ocupado}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={() => { const id = confirmando.id; setConfirmando(null); onRemover(id); }}
        >
          <p>
            <strong>{trilha.participantes.find((p) => p.id === confirmando.id)?.nome}</strong> está com o turno aberto.
            Remover encerra essa ativação sem concluir o turno.
          </p>
          <p>O token continua no mapa.</p>
        </Confirmacao>
      )}
    </>
  );
}

/**
 * PA restantes em losangos (acesos = o que sobra). Token sem ficha tem
 * 0 PA — aí um traço, não uma fileira vazia que pareceria "gastou tudo".
 * Acima de 6, número: losangos demais viram ruído.
 */
function PaLosangos({ total, restante }: { total: number; restante: number }) {
  const rotulo = `${restante} de ${total} PA restantes`;
  if (total <= 0) return <span className="jfc-pa is-vazio" role="img" aria-label="Sem PA na ficha">—</span>;
  if (total > 6) return <span className="jfc-pa is-num" role="img" aria-label={rotulo}>{restante}/{total}</span>;
  return (
    <span className="jfc-pa" role="img" aria-label={rotulo}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < restante ? "is-on" : undefined} />)}
    </span>
  );
}

/**
 * Diálogo de confirmação do painel — `alertdialog` de verdade
 * (rotulado, modal), no mesmo desenho do `.rv-modal` que a remoção de
 * token já usa. Confirmar aqui é sempre sobre algo que atinge a mesa
 * inteira ou derruba um turno aberto.
 */
function Confirmacao({
  titulo, rotuloConfirmar, ocupado, children, onCancelar, onConfirmar,
}: {
  titulo: string; rotuloConfirmar: string; ocupado: boolean; children: React.ReactNode;
  onCancelar: () => void; onConfirmar: () => void;
}) {
  return (
    <div className="rv-modal-fundo" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}>
      <div className="rv-modal rv-modal--confirmar" role="alertdialog" aria-modal="true" aria-label={titulo}>
        <header className="rv-modal-cab">
          <h2>{titulo}</h2>
          <button type="button" className="rv-modal-fechar" aria-label="Fechar" onClick={onCancelar}>×</button>
        </header>
        <div className="rv-modal-corpo">{children}</div>
        <footer className="rv-modal-rodape">
          <button type="button" className="rv-btn rv-btn--ghost" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="rv-btn rv-btn--perigo" disabled={ocupado} onClick={onConfirmar}>
            {ocupado ? <><Loader2 size={13} className="rv-girando" /> Aguarde…</> : rotuloConfirmar}
          </button>
        </footer>
      </div>
    </div>
  );
}
