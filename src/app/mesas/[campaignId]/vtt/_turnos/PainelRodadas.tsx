"use client";

/**
 * Painel da ferramenta "Rodadas" — iniciar, administrar e encerrar o
 * combate da cena.
 *
 * MESMA CASCA das ferramentas Terreno/Objetos/Medir (`.rv-fp`,
 * ancorado à barra de ferramentas, rolagem interna): é a linguagem já
 * estabelecida pra "painel de ferramenta", e inventar uma superfície
 * nova aqui faria a ferramenta parecer outra coisa.
 *
 * DIVISÃO DE RESPONSABILIDADE com `TrilhaFaccoes.tsx`:
 *
 *   · Este painel é ADMINISTRAÇÃO — existe fora do combate (pra montar
 *     e começar) e é aberto sob demanda. Elenco, modo, participação.
 *   · A trilha é OPERAÇÃO — existe durante o combate, sempre visível,
 *     e é onde se declara janela, assume turno, conclui e avança
 *     janela/rodada.
 *
 * Por isso o painel NÃO repete os controles de avançar janela/rodada:
 * duplicá-los criaria dois lugares dizendo a mesma coisa, com a chance
 * real de discordarem na tela por um instante.
 *
 * Nada aqui decide regra de combate. O estado inicial vem de
 * `serializacao.estadoInicialTrilha`, as edições de elenco das
 * transições de administração do mesmo módulo, e toda pergunta sobre
 * elegibilidade continua sendo de `modelo.ts`.
 */

import { useMemo, useState } from "react";
import { Loader2, Swords } from "lucide-react";
import { JanelaFerramenta } from "../_shell/JanelaFerramenta";
import {
  type EstadoTrilha, type Lado, type ModoCena,
  ROTULO_JANELA_CURTO, ROTULO_LADO, elegiveisAgora,
} from "./modelo";
import type { TokenApresentacao } from "../_dominio/tokenApresentacao";

/**
 * Modos que a trilha realmente usa.
 *
 * `ModoCena` tem quatro valores, mas só dois fazem sentido como
 * ESCOLHA de início: "combate" e "emboscada" são os que o modelo
 * consome (`elegibilidade`/`ladoDaVez` só se ramificam em emboscada).
 * "tregua" suspende a contagem de turnos e "exploracao" é a ausência
 * de combate — nos dois casos, o certo é NÃO ter trilha aberta, então
 * oferecê-los como forma de iniciar rodadas seria oferecer um botão
 * que se contradiz.
 */
const MODOS_INICIAIS: { id: ModoCena; rotulo: string; dica: string }[] = [
  { id: "combate", rotulo: "Combate", dica: "Rodada normal: as jogadas alternam entre os dois lados." },
  { id: "emboscada", rotulo: "Emboscada", dica: "Rodada surpresa: o lado que emboscou age inteiro, só com turnos rápidos." },
];

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
}


export function PainelRodadas(props: PainelRodadasProps) {
  return (
    <JanelaFerramenta
      id="rodadas"
      icone={<Swords size={16} />}
      titulo="Rodadas"
      modo={props.trilha ? `Rodada ${props.trilha.rodada} · ${ROTULO_JANELA_CURTO[props.trilha.janela]}` : "Nenhum combate em andamento"}
      rotulo="Ferramenta Rodadas"
      rotuloFechar="Fechar painel de Rodadas"
      aoFechar={props.onFechar}
      className="rv-fp--rodadas"
      testId="painel-rodadas"
    >
      <div className="rv-fp-corpo">
        {props.erro && <p className="rv-rodadas-erro" role="alert">{props.erro}</p>}
        {props.trilha
          ? <Administracao {...props} trilha={props.trilha} />
          : <Configuracao {...props} />}
      </div>
    </JanelaFerramenta>
  );
}

/* ══════════════════ ANTES DE COMEÇAR ══════════════════ */

function Configuracao({ ehNarrador, tokens, ocupado, onIniciar }: PainelRodadasProps) {
  // Começa com TODO MUNDO marcado: montar um combate com o elenco
  // inteiro da cena é o caso comum, e desmarcar dois é menos trabalho
  // que marcar oito.
  const [escolhidos, setEscolhidos] = useState<Set<string>>(() => new Set(tokens.map((t) => t.id)));
  const [modo, setModo] = useState<ModoCena>("combate");
  const [ladoSurpresa, setLadoSurpresa] = useState<Lado | null>(null);

  const porLado = useMemo(() => agruparPorLado(tokens), [tokens]);
  const contagem = {
    pj: porLado.pj.filter((t) => escolhidos.has(t.id)).length,
    pn: porLado.pn.filter((t) => escolhidos.has(t.id)).length,
  };
  const total = contagem.pj + contagem.pn;

  const alternar = (id: string) => setEscolhidos((s) => {
    const proximo = new Set(s);
    if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
    return proximo;
  });

  const faltaLadoSurpresa = modo === "emboscada" && ladoSurpresa === null;
  const impedimento = tokens.length === 0
    ? "Esta cena ainda não tem tokens. Adicione personagens ao mapa para montar o combate."
    : total === 0 ? "Escolha pelo menos um participante."
    : faltaLadoSurpresa ? "Escolha qual lado surpreendeu."
    : null;

  if (!ehNarrador) {
    return (
      <p className="rv-rodadas-vazio">
        Não há rodadas em andamento nesta cena. Só o narrador inicia o combate.
      </p>
    );
  }

  return (
    <>
      {tokens.length === 0 ? (
        <p className="rv-rodadas-vazio">
          Esta cena ainda não tem nenhum token. Adicione personagens ao mapa (ferramenta de token, na barra
          lateral) e volte aqui para montar o combate.
        </p>
      ) : (
        <>
          <div className="rv-rodadas-secao">
            <div className="rv-rodadas-secao-cab">
              <h3>Participantes</h3>
              <div className="rv-rodadas-massa">
                <button type="button" className="rv-btn rv-btn--ghost"
                  onClick={() => setEscolhidos(new Set(tokens.map((t) => t.id)))}>Selecionar todos</button>
                <button type="button" className="rv-btn rv-btn--ghost"
                  onClick={() => setEscolhidos(new Set())}>Limpar seleção</button>
              </div>
            </div>

            {(["pj", "pn"] as Lado[]).map((lado) => (
              <fieldset key={lado} className="rv-rodadas-grupo" data-lado={lado}>
                <legend>{ROTULO_LADO[lado]} <span>{contagem[lado]}/{porLado[lado].length}</span></legend>
                {porLado[lado].length === 0 && <p className="rv-rodadas-grupo-vazio">Nenhum token deste lado.</p>}
                {porLado[lado].map((t) => (
                  <label key={t.id} className="rv-rodadas-item">
                    <input type="checkbox" checked={escolhidos.has(t.id)} onChange={() => alternar(t.id)} />
                    <span className="rv-rodadas-sigla" data-vertente={t.vertente}>{t.sigla}</span>
                    <span className="rv-rodadas-nome">{t.nome}</span>
                    {!t.visivel && <span className="rv-rodadas-tag">oculto</span>}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>

          <div className="rv-rodadas-secao">
            <h3>Modo</h3>
            <div className="rv-rodadas-modos" role="radiogroup" aria-label="Modo do combate">
              {MODOS_INICIAIS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={modo === m.id}
                  className="rv-rodadas-modo"
                  title={m.dica}
                  onClick={() => { setModo(m.id); if (m.id !== "emboscada") setLadoSurpresa(null); }}
                >
                  <strong>{m.rotulo}</strong>
                  <span>{m.dica}</span>
                </button>
              ))}
            </div>

            {modo === "emboscada" && (
              <div className="rv-rodadas-surpresa" role="radiogroup" aria-label="Lado que surpreendeu">
                <span className="rv-rodadas-rotulo">Quem emboscou</span>
                {(["pj", "pn"] as Lado[]).map((lado) => (
                  <button key={lado} type="button" role="radio" aria-checked={ladoSurpresa === lado}
                    className="rv-rodadas-lado" data-lado={lado} onClick={() => setLadoSurpresa(lado)}>
                    {ROTULO_LADO[lado]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <footer className="rv-rodadas-rodape">
            <p className="rv-rodadas-resumo">
              <strong>{total}</strong> {total === 1 ? "participante" : "participantes"}
              {" · "}{contagem.pj} {ROTULO_LADO.pj.toLowerCase()}
              {" · "}{contagem.pn} {ROTULO_LADO.pn.toLowerCase()}
            </p>
            <button
              type="button"
              className="rv-btn rv-btn--pri rv-rodadas-iniciar"
              disabled={impedimento !== null || ocupado}
              title={impedimento ?? undefined}
              onClick={() => onIniciar({ tokenIds: [...escolhidos], modo, ladoSurpresa })}
            >
              {ocupado ? <><Loader2 size={13} className="rv-girando" /> Iniciando…</> : "Iniciar rodadas"}
            </button>
            {impedimento && <p className="rv-rodadas-aviso" role="status">{impedimento}</p>}
          </footer>
        </>
      )}
    </>
  );
}

/* ══════════════════ COM COMBATE ABERTO ══════════════════ */

function Administracao({
  trilha, tokens, ehNarrador, oculta, ocupado,
  onEncerrar, onAdicionar, onRemover, onAlternarIncapaz, onEncerrarParticipacao, onAlternarOculta,
}: PainelRodadasProps & { trilha: EstadoTrilha }) {
  const [confirmando, setConfirmando] = useState<null | { tipo: "encerrar" } | { tipo: "remover"; id: string }>(null);

  const idsNaTrilha = new Set(trilha.participantes.map((p) => p.id));
  const forasteiros = tokens.filter((t) => !idsNaTrilha.has(t.id));
  const agindo = trilha.participantes.find((p) => p.id === trilha.agindoId) ?? null;
  const aptos = elegiveisAgora(trilha);
  const conta = (lado: Lado) => trilha.participantes.filter((p) => p.lado === lado).length;
  const tokenPorId = new Map(tokens.map((t) => [t.id, t]));

  return (
    <>
      <dl className="rv-rodadas-estado">
        <div><dt>Rodada</dt><dd>{trilha.rodada}</dd></div>
        <div><dt>Janela</dt><dd>{ROTULO_JANELA_CURTO[trilha.janela]}</dd></div>
        <div><dt>Em ação</dt><dd>{agindo ? agindo.nome : "—"}</dd></div>
        <div><dt>{ROTULO_LADO.pj}</dt><dd>{conta("pj")}</dd></div>
        <div><dt>{ROTULO_LADO.pn}</dt><dd>{conta("pn")}</dd></div>
        {trilha.modo === "emboscada" && (
          <div><dt>Emboscada</dt><dd>{trilha.ladoSurpresa ? ROTULO_LADO[trilha.ladoSurpresa] : "—"}</dd></div>
        )}
      </dl>
      {/* Avançar janela/rodada mora na trilha, não aqui — ver o
          cabeçalho deste arquivo. */}
      <p className="rv-rodadas-nota">
        Declarar janela, assumir turno e avançar rodada continuam nos trilhos, ao lado de cada personagem.
      </p>

      <div className="rv-rodadas-secao">
        <h3>Na trilha</h3>
        <ul className="rv-rodadas-lista">
          {trilha.participantes.map((p) => {
            const token = tokenPorId.get(p.id);
            const apto = aptos.some((q) => q.id === p.id);
            const sumido = !token;
            return (
              <li key={p.id} className="rv-rodadas-linha" data-lado={p.lado} data-agindo={trilha.agindoId === p.id}>
                <span className="rv-rodadas-sigla" data-vertente={token?.vertente ?? "nenhuma"}>{token?.sigla ?? "??"}</span>
                <span className="rv-rodadas-nome">
                  {p.nome}
                  <small>
                    {sumido ? "token removido do mapa"
                      : trilha.agindoId === p.id ? "em ação"
                      : p.incapaz ? p.incapaz.motivo
                      : p.encerrou ? "encerrou a participação"
                      : apto ? "pode agir"
                      : "aguardando"}
                  </small>
                </span>
                {ehNarrador && (
                  <span className="rv-rodadas-acoes">
                    <button type="button" className="rv-rodadas-mini" aria-pressed={!!p.incapaz} disabled={ocupado}
                      title={p.incapaz ? `Reverter "incapaz" de ${p.nome}` : `Marcar ${p.nome} como incapaz de agir`}
                      onClick={() => onAlternarIncapaz(p.id, !p.incapaz)}>Incapaz</button>
                    <button type="button" className="rv-rodadas-mini" disabled={ocupado || p.encerrou}
                      title={`Encerrar a participação de ${p.nome} nesta rodada`}
                      onClick={() => onEncerrarParticipacao(p.id)}>Passar</button>
                    <button type="button" className="rv-rodadas-mini rv-rodadas-mini--perigo" disabled={ocupado}
                      aria-label={`Remover ${p.nome} das rodadas`}
                      title={`Remover ${p.nome} das rodadas`}
                      onClick={() => {
                        // Tirar quem está agindo derruba a ativação
                        // aberta — isso precisa ser dito, não
                        // descoberto depois.
                        if (trilha.agindoId === p.id) setConfirmando({ tipo: "remover", id: p.id });
                        else onRemover(p.id);
                      }}>Remover</button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {ehNarrador && forasteiros.length > 0 && (
        <div className="rv-rodadas-secao">
          <h3>Fora da trilha <span className="rv-rodadas-conta">{forasteiros.length}</span></h3>
          <ul className="rv-rodadas-lista">
            {forasteiros.map((t) => (
              <li key={t.id} className="rv-rodadas-linha" data-lado={t.lado === "pj" ? "pj" : "pn"}>
                <span className="rv-rodadas-sigla" data-vertente={t.vertente}>{t.sigla}</span>
                <span className="rv-rodadas-nome">{t.nome}<small>{t.lado === "pj" ? ROTULO_LADO.pj : ROTULO_LADO.pn}</small></span>
                <span className="rv-rodadas-acoes">
                  <button type="button" className="rv-rodadas-mini" disabled={ocupado}
                    aria-label={`Adicionar ${t.nome} às rodadas`}
                    onClick={() => onAdicionar([t.id])}>Adicionar</button>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="rv-btn rv-btn--ghost" disabled={ocupado}
            onClick={() => onAdicionar(forasteiros.map((t) => t.id))}>Adicionar todos</button>
        </div>
      )}

      <footer className="rv-rodadas-rodape">
        {/* Ocultar é LOCAL: nem toca no combate, nem aparece pros
            outros. Fica separado de "Encerrar" com folga real — são as
            duas ações mais fáceis de confundir deste painel. */}
        <button type="button" className="rv-btn rv-btn--ghost" aria-pressed={oculta} onClick={onAlternarOculta}>
          {oculta ? "Mostrar trilha para mim" : "Ocultar trilha para mim"}
        </button>
        <span className="rv-rodadas-nota-mini">
          {oculta ? "Os trilhos estão escondidos só na sua tela — o combate continua." : "Esconde os trilhos só na sua tela."}
        </span>
        {ehNarrador && (
          <button type="button" className="rv-btn rv-btn--perigo rv-rodadas-encerrar" disabled={ocupado}
            onClick={() => setConfirmando({ tipo: "encerrar" })}>
            Encerrar rodadas
          </button>
        )}
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

/** Token "neutro" conta como lado do narrador — a mesma tradução que `participanteDeToken` faz. */
function agruparPorLado(tokens: readonly TokenApresentacao[]): Record<Lado, TokenApresentacao[]> {
  return {
    pj: tokens.filter((t) => t.lado === "pj"),
    pn: tokens.filter((t) => t.lado !== "pj"),
  };
}
