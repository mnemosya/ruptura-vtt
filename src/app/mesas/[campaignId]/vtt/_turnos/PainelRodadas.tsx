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

import { useMemo, useRef, useState } from "react";
import { Ban, Eye, EyeOff, Loader2, SkipForward, Swords, UserMinus, UserPlus } from "lucide-react";
import { JanelaFerramenta } from "../_shell/JanelaFerramenta";
import {
  type EstadoTrilha, type Lado, type ModoCena, type Participante,
  PISO_PA, ROTULO_JANELA_CURTO, ROTULO_LADO, TETO_PA,
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
  { id: "combate", rotulo: "Combate padrão", dica: "Rodada normal: as jogadas alternam entre os dois lados." },
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
      indice="05"
      icone={<Swords size={16} />}
      titulo={props.trilha ? "Combate ativo" : "Rodadas"}
      modo={props.trilha
        ? `Rodada ${props.trilha.rodada} · Janela ${ROTULO_JANELA_CURTO[props.trilha.janela]}`
        : "Configuração · nenhum combate ativo"}
      rotulo="Ferramenta Rodadas"
      rotuloFechar="Fechar painel de Rodadas"
      aoFechar={props.onFechar}
      className={props.trilha ? "rv-fp--rodadas rv-fp--rodadas-ativo" : "rv-fp--rodadas"}
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
          {/* Readout do estudo: os três números que decidem se o combate
              está montado direito, antes de qualquer lista. */}
          <div className="rv-fp-placas">
            <div className="rv-fp-placa">
              <span className="rv-fp-placa-rot">Participantes</span>
              <span className="rv-fp-placa-val" data-testid="rodadas-conta-total">{total}</span>
            </div>
            <div className="rv-fp-placa" data-acento="cy">
              <span className="rv-fp-placa-rot">{ROTULO_LADO.pj}</span>
              <span className="rv-fp-placa-val">{contagem.pj}</span>
            </div>
            <div className="rv-fp-placa" data-acento="dg">
              <span className="rv-fp-placa-rot">{ROTULO_LADO.pn}</span>
              <span className="rv-fp-placa-val">{contagem.pn}</span>
            </div>
          </div>

          <div className="rv-fp-grupo">
            {/* Título curto: as três placas acima já dão a contagem, e
                repeti-la aqui roubava a largura de "Todos/Nenhum". */}
            <span className="rv-fp-rotulo" id="rv-rodadas-rot-part">
              Participantes
              <span className="rv-rodadas-massa">
                <button type="button" className="rv-rodadas-massa-btn"
                  onClick={() => setEscolhidos(new Set(tokens.map((t) => t.id)))}>Todos</button>
                <button type="button" className="rv-rodadas-massa-btn"
                  onClick={() => setEscolhidos(new Set())}>Nenhum</button>
              </span>
            </span>
            {/* Lista PLANA, com o lado como etiqueta na própria linha —
                o estudo não separa em dois blocos, e dois `fieldset`
                empilhados gastavam altura repetindo um rótulo que cabe
                na linha. */}
            <div className="rv-rodadas-lista" role="group" aria-labelledby="rv-rodadas-rot-part">
              {tokens.map((t) => (
                <label key={t.id} className="rv-rodadas-item" data-lado={t.lado}>
                  <input type="checkbox" checked={escolhidos.has(t.id)} onChange={() => alternar(t.id)} />
                  <span className="rv-rodadas-sigla" data-vertente={t.vertente}>{t.sigla}</span>
                  <span className="rv-rodadas-item-txt">
                    <span className="rv-rodadas-nome">{t.nome}</span>
                    <span className="rv-rodadas-item-sub">
                      {t.lado === "pj" ? "Personagem jogador" : "Personagem do narrador"}
                      {!t.visivel && " · oculto"}
                    </span>
                  </span>
                  <span className="rv-rodadas-item-lado" data-lado={t.lado}>{t.lado === "pj" ? "PJ" : "PN"}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rv-fp-grupo">
            <span className="rv-fp-rotulo" id="rv-rodadas-rot-modo">Modo</span>
            <div className="rv-rodadas-modos" role="radiogroup" aria-labelledby="rv-rodadas-rot-modo">
              {/* A dica vive FORA do `<button>`: o Chromium não pinta
                  filho posicionado que ultrapasse a caixa de um botão,
                  então dentro dele a dica ficava recortada. O invólucro
                  é quem ancora. `aria-describedby` mantém a explicação
                  ligada ao controle pra quem usa leitor de tela. */}
              {MODOS_INICIAIS.map((m) => (
                <div key={m.id} className="rv-rodadas-modo-caixa">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={modo === m.id}
                    aria-describedby={`rv-modo-dica-${m.id}`}
                    className="rv-rodadas-modo"
                    onClick={() => { setModo(m.id); if (m.id !== "emboscada") setLadoSurpresa(null); }}
                  >
                    <strong>{m.rotulo}</strong>
                  </button>
                  <span className="rv-rodadas-modo-dica" id={`rv-modo-dica-${m.id}`} role="tooltip">{m.dica}</span>
                </div>
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

          {impedimento && <p className="rv-rodadas-aviso" role="status">{impedimento}</p>}

          <footer className="rv-fp-rodape rv-rodadas-rodape">
            {/* Compacto: o rodapé confirma o que vai começar, não repete
                as placas. Por extenso ele não cabia ao lado do botão. */}
            <p className="rv-rodadas-resumo">
              <strong>{total}</strong> no combate · {contagem.pj} PJ · {contagem.pn} PN
            </p>
            <button
              type="button"
              className="rv-fp-primaria rv-rodadas-iniciar"
              disabled={impedimento !== null || ocupado}
              title={impedimento ?? undefined}
              onClick={() => onIniciar({ tokenIds: [...escolhidos], modo, ladoSurpresa })}
            >
              {ocupado ? <><Loader2 size={13} className="rv-girando" /> Iniciando…</> : "Iniciar rodadas"}
            </button>
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
  const tokenPorId = new Map(tokens.map((t) => [t.id, t]));

  /**
   * "Restante" = ainda ESTÁ NA RODADA: não passou a vez e não está
   * incapaz. Deliberadamente NÃO é `elegiveisAgora`, que é a
   * elegibilidade fina da janela (PA restante, teto, alternância):
   * token sem ficha ligada tem 0 PA, então por aquela conta o combate
   * nasceria com "0 restantes de cada lado" — um número que não
   * descreve nada do que está na tela. Quem pode agir AGORA, com todas
   * as regras de PA, é a trilha que diz, ao lado de cada personagem.
   */
  const naRodada = (p: Participante) => !p.encerrou && !p.incapaz;
  const restantes = (lado: Lado) => trilha.participantes.filter((p) => p.lado === lado && naRodada(p)).length;

  return (
    <>
      {/* Readout: a rodada e o que resta de cada lado. */}
      <div className="rv-fp-placas">
        <div className="rv-fp-placa" data-acento="am">
          <span className="rv-fp-placa-rot">Rodada</span>
          <span className="rv-fp-placa-val" data-testid="rodadas-rodada">{trilha.rodada}</span>
        </div>
        <div className="rv-fp-placa" data-acento="cy">
          <span className="rv-fp-placa-rot">PJ restantes</span>
          <span className="rv-fp-placa-val">{restantes("pj")}</span>
        </div>
        <div className="rv-fp-placa" data-acento="dg">
          <span className="rv-fp-placa-rot">PN restantes</span>
          <span className="rv-fp-placa-val">{restantes("pn")}</span>
        </div>
      </div>

      {/* A janela aberta é a REGRA em vigor: o nome sozinho não diz o
          que ela permite, e o custo é a única coisa que muda o que
          pode ser declarado agora. Os dois juntos, numa nota só. */}
      <div className="rv-rodadas-regra" data-janela={trilha.janela}>
        <span className="rv-rodadas-regra-nome">Janela {ROTULO_JANELA_CURTO[trilha.janela]}</span>
        <span className="rv-rodadas-regra-valor">
          {trilha.janela === "rapidos"
            ? `Custo de ação ≤ ${TETO_PA.rapidos} PA`
            : `Custo de ação ≥ ${PISO_PA.lentos} PA`}
          {trilha.modo === "emboscada" && trilha.ladoSurpresa
            ? ` · emboscada de ${trilha.ladoSurpresa === "pj" ? "PJ" : "PN"}`
            : ""}
        </span>
      </div>

      <div className="rv-rodadas-secao">
        <h3>Participantes</h3>
        <ul className="rv-rodadas-lista">
          {trilha.participantes.map((p) => {
            const token = tokenPorId.get(p.id);
            const sumido = !token;
            // A linha diz o ESTADO só quando ele não é o esperado.
            // "Pode agir"/"aguardando" é o caso comum e escrevê-lo em
            // toda linha vira ruído — o que precisa saltar é o turno
            // aberto, o incapaz, quem já passou e o token que sumiu.
            const excecao = sumido ? "token removido do mapa"
              : trilha.agindoId === p.id ? "em ação"
              : p.incapaz ? p.incapaz.motivo
              : p.encerrou ? "encerrou a participação"
              : null;
            return (
              <li key={p.id} className="rv-rodadas-linha" data-lado={p.lado}
                data-agindo={trilha.agindoId === p.id} data-fora={sumido || !naRodada(p)}>
                <span className="rv-rodadas-sigla" data-lado={p.lado}>{token?.sigla ?? "??"}</span>
                <span className="rv-rodadas-item-txt">
                  <span className="rv-rodadas-nome">{p.nome}</span>
                  {excecao && <span className="rv-rodadas-item-sub">{excecao}</span>}
                </span>
                {ehNarrador && (
                  <span className="rv-rodadas-acoes">
                    {/* Ícone, não palavra: são três ações por linha e
                        por linha há muitas. O nome vive no `title` e no
                        `aria-label` — nunca só na forma do desenho. */}
                    <BotaoIcone className="rv-rodadas-mini" icone={<Ban size={13} />} pressionado={!!p.incapaz}
                      desabilitado={ocupado}
                      rotulo={p.incapaz ? `Reverter "incapaz" de ${p.nome}` : `Marcar ${p.nome} como incapaz de agir`}
                      onClick={() => onAlternarIncapaz(p.id, !p.incapaz)} />
                    <BotaoIcone className="rv-rodadas-mini" icone={<SkipForward size={13} />}
                      desabilitado={ocupado || p.encerrou}
                      rotulo={`Encerrar a participação de ${p.nome} nesta rodada`}
                      onClick={() => onEncerrarParticipacao(p.id)} />
                    <BotaoIcone className="rv-rodadas-mini rv-rodadas-mini--perigo" icone={<UserMinus size={13} />}
                      desabilitado={ocupado}
                      rotulo={`Remover ${p.nome} das rodadas`}
                      onClick={() => {
                        // Tirar quem está agindo derruba a ativação
                        // aberta — isso precisa ser dito, não
                        // descoberto depois.
                        if (trilha.agindoId === p.id) setConfirmando({ tipo: "remover", id: p.id });
                        else onRemover(p.id);
                      }} />
                  </span>
                )}
                <span className="rv-rodadas-item-lado" data-lado={p.lado}>{p.lado === "pj" ? "PJ" : "PN"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {ehNarrador && forasteiros.length > 0 && (
        <div className="rv-rodadas-secao">
          <h3>
            Fora da trilha
            <span className="rv-rodadas-massa">
              <button type="button" className="rv-rodadas-massa-btn" disabled={ocupado}
                onClick={() => onAdicionar(forasteiros.map((t) => t.id))}>Adicionar todos</button>
            </span>
          </h3>
          <ul className="rv-rodadas-lista">
            {forasteiros.map((t) => {
              const lado: Lado = t.lado === "pj" ? "pj" : "pn";
              return (
                <li key={t.id} className="rv-rodadas-linha" data-lado={lado} data-fora="true">
                  <span className="rv-rodadas-sigla" data-lado={lado}>{t.sigla}</span>
                  <span className="rv-rodadas-item-txt"><span className="rv-rodadas-nome">{t.nome}</span></span>
                  <span className="rv-rodadas-acoes">
                    <BotaoIcone className="rv-rodadas-mini" icone={<UserPlus size={13} />} desabilitado={ocupado}
                      rotulo={`Adicionar ${t.nome} às rodadas`}
                      onClick={() => onAdicionar([t.id])} />
                  </span>
                  <span className="rv-rodadas-item-lado" data-lado={lado}>{lado === "pj" ? "PJ" : "PN"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Rodapé: encerrar à esquerda, deliberadamente QUIETO — é a ação
          que atinge a mesa inteira, e ela não deve atrair o clique. À
          direita, ocultar a trilha, que é local e só afeta esta tela. */}
      <footer className="rv-fp-rodape rv-rodadas-rodape rv-rodadas-rodape--ativo">
        {ehNarrador ? (
          <button type="button" className="rv-rodadas-encerrar" disabled={ocupado}
            onClick={() => setConfirmando({ tipo: "encerrar" })}>
            Encerrar combate
          </button>
        ) : <span className="rv-rodadas-encerrar-vazio" />}
        {/* Fora do grupo `.rv-rodadas-mini`: aquilo é ação de
            ADMINISTRAÇÃO sobre um participante (só narrador). Ocultar
            é preferência de tela, de qualquer pessoa da mesa. */}
        <BotaoIcone className="rv-rodadas-olho" pressionado={oculta}
          icone={oculta ? <EyeOff size={13} /> : <Eye size={13} />}
          rotulo={oculta ? "Mostrar a trilha para mim" : "Ocultar a trilha só para mim"}
          onClick={onAlternarOculta} />
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
 * Botão de ÍCONE com dica.
 *
 * Sem rótulo escrito, o nome da ação tem que estar a um hover (ou a um
 * foco de teclado) de distância — e o `title` nativo não serve: demora
 * ~1,5s, ignora o teclado e não segue o desenho da janela.
 *
 * A dica é `position: fixed` com coordenadas medidas no próprio botão
 * porque o corpo da janela ROLA: qualquer caixa absoluta que passasse
 * da borda seria recortada pelo `overflow-y` do corpo. Acima do botão
 * por padrão, e abaixo quando não há espaço em cima.
 *
 * `aria-label` continua sendo a fonte pra leitor de tela — a dica é
 * `aria-hidden`, senão o nome seria anunciado duas vezes.
 */
function BotaoIcone({
  rotulo, icone, className, pressionado, desabilitado, onClick,
}: {
  rotulo: string; icone: React.ReactNode; className: string;
  pressionado?: boolean; desabilitado?: boolean; onClick: () => void;
}) {
  const [dica, setDica] = useState<{ x: number; y: number; acima: boolean } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  const mostrar = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const acima = r.top > 44;
    setDica({ x: r.left + r.width / 2, y: acima ? r.top - 6 : r.bottom + 6, acima });
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        aria-label={rotulo}
        aria-pressed={pressionado}
        disabled={desabilitado}
        onPointerEnter={mostrar}
        onFocus={mostrar}
        onPointerLeave={() => setDica(null)}
        onBlur={() => setDica(null)}
        onClick={() => { setDica(null); onClick(); }}
      >
        {icone}
      </button>
      {dica && (
        <span
          className="rv-rodadas-dica"
          role="tooltip"
          aria-hidden="true"
          style={{
            left: dica.x, top: dica.y,
            transform: `translate(-50%, ${dica.acima ? "-100%" : "0"})`,
          }}
        >
          {rotulo}
        </span>
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
