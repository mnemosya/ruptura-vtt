"use client";

/**
 * Trilha de turnos — direção visual "Facções em confronto".
 *
 * O QUE MUDA EM RELAÇÃO AO DOCK ANTERIOR (e por quê):
 *
 * O desenho antigo era um painel largo no RODAPÉ do palco, com dois
 * grupos (Rápidos/Lentos) de cards horizontais. Ele resolvia a leitura
 * "em que janela cada um declarou", mas custava uma faixa inteira do
 * mapa e empurrava a leitura de ELEGIBILIDADE (quem pode agir agora,
 * que é o que `_turnos/modelo.ts` existe pra dizer) pra dentro de
 * cards pequenos, longe do token correspondente.
 *
 * Aqui a mesma informação vira TRÊS superfícies estreitas, todas
 * encostadas nas bordas do palco:
 *
 *  · Um núcleo compacto no topo — rodada, janela em resolução, teto de
 *    PA da janela, facção da vez e estado da ativação. É o único lugar
 *    que responde "onde estamos na rodada".
 *  · Um trilho à ESQUERDA com os personagens dos jogadores.
 *  · Um trilho à DIREITA com os do narrador.
 *
 * Só a facção que PODE agir agora recebe realce (`data-ativa`). Isso é
 * derivado do modelo, nunca de um estado paralelo: com alguém agindo,
 * a facção ativa é a dele; sem ninguém agindo, é a que tem alguém em
 * `elegiveisAgora` — o que já embute alternância (regras 2 e 3),
 * emboscada (regra 6) e "o outro lado acabou, este segue em sequência".
 *
 * NENHUM banner/rodapé/modal de confirmação: a ação de assumir turno
 * fica ao lado do retrato de quem pode agir, e a resolução (gastar PA/
 * passar) abre DENTRO do slot de quem está agindo. Um aviso central
 * de "seu lado pode agir" repetiria o núcleo do topo e comeria mapa.
 *
 * A DECLARAÇÃO continua existindo (é regra — ver `declarar` no modelo,
 * e a elegibilidade recusa quem não declarou): virou um par de botões
 * minúsculos R/L no próprio slot, em vez do menu "+ Declarar" e do
 * arrasto entre grupos. Mesma transição do modelo, mesmo travamento
 * (quem já resolveu a rodada não pode redeclarar).
 *
 * Este arquivo não decide NADA de regra: toda pergunta ("pode agir?",
 * "qual o teto de PA?", "quem é a vez?", "dá pra encerrar a janela?")
 * é delegada a `_turnos/modelo.ts`.
 */

import { useState } from "react";
import {
  type EstadoTrilha, type Janela, type Lado, type Participante,
  DICA_JANELA, PISO_PA, ROTULO_JANELA_CURTO, ROTULO_LADO, TETO_PA,
  elegibilidade, elegiveisAgora, ladoDaVez, paRestante, podeEncerrarJanela,
  sugestaoDesempate, tetoPaAgora,
} from "./modelo";
import type { TokenApresentacao } from "../_dominio/tokenApresentacao";

export interface TrilhaFaccoesProps {
  trilha: EstadoTrilha;
  ehNarrador: boolean;
  tokenPorId: Map<string, TokenApresentacao>;
  /** Token selecionado no mapa — o retrato correspondente fica marcado. */
  selecionadoId: string | null;
  onDeclarar: (id: string, janela: Janela) => void;
  onAssumir: (id: string) => void;
  onConcluir: (pa: number) => void;
  onEncerrar: (id: string) => void;
  onAvancarJanela: () => void;
  onProximaRodada: () => void;
  /** Clique no retrato: seleciona e centraliza o token — nunca inicia turno. */
  onFocar: (id: string) => void;
}

/**
 * Situação de leitura de um participante. É uma projeção da
 * elegibilidade do modelo pra UMA palavra — o que decide realce,
 * atenuação e ordem. "aguardando" é deliberadamente diferente de
 * "agiu": quem espera a alternância continua legível, quem já resolveu
 * fica atenuado.
 */
type Situacao = "agindo" | "apto" | "aguardando" | "agiu" | "fora";

const ORDEM_SITUACAO: Record<Situacao, number> = { agindo: 0, apto: 1, aguardando: 2, agiu: 3, fora: 4 };

function situacaoDe(p: Participante, trilha: EstadoTrilha): Situacao {
  if (trilha.agindoId === p.id) return "agindo";
  const el = elegibilidade(p, trilha);
  if (el.apto) return "apto";
  // Barrado SÓ pela alternância é espera, não conclusão — vale mesmo
  // pra quem já agiu numa janela anterior e volta de fragmentação.
  // Atenuar aqui diria "acabou pra ele" sobre quem age daqui a pouco.
  // (`elegibilidade` já testa "já agiu nesta janela" ANTES da
  // alternância, então quem realmente terminou nunca cai neste ramo.)
  if (el.motivo?.tipo === "aguarda_alternancia") return "aguardando";
  if (p.agiuEm.length > 0) return "agiu";
  if (p.incapaz || p.encerrou) return "fora";
  return "aguardando";
}

/**
 * Ordem dentro do trilho: primeiro por situação (quem pode agir sobe),
 * e DENTRO da mesma situação pela sugestão de desempate do livro
 * (maior Reflexos primeiro). `sort` é estável, então aplicar o
 * desempate antes e a situação depois preserva os dois critérios.
 */
function ordenarTrilho(participantes: Participante[], trilha: EstadoTrilha): Participante[] {
  return sugestaoDesempate(participantes)
    .sort((a, b) => ORDEM_SITUACAO[situacaoDe(a, trilha)] - ORDEM_SITUACAO[situacaoDe(b, trilha)]);
}

/** Teto de PA da janela, curto — derivado das constantes do modelo, nunca digitado à mão. */
function limiteDaJanela(janela: Janela): string {
  return janela === "rapidos" ? `até ${TETO_PA.rapidos} PA` : `${PISO_PA.lentos}+ PA`;
}

/**
 * Rótulo dos botões de declaração.
 *
 * "R"/"L" eram opacos: a inicial não diz o que a janela É, e o custo em
 * PA — que é a informação com a qual o jogador decide — ficava só no
 * `title`. Aqui o botão mostra GLIFO + TETO (`⚡ ≤2`, `◆ 3+`): o número
 * é a regra, o glifo dá a leitura rápida, e nenhum dos dois precisa da
 * palavra inteira ocupando o trilho. O texto completo continua no
 * `title`/`aria-label`, que é onde ele não custa largura.
 *
 * Os números vêm de `TETO_PA`/`PISO_PA`, não de literais — se a regra
 * mudar, o botão muda junto.
 */
const DECLARACAO: Record<Janela, { glifo: string; teto: string; descricao: string }> = {
  rapidos: {
    glifo: "⚡",
    teto: `≤${TETO_PA.rapidos}`,
    descricao: `Declarar turno rápido — ações de até ${TETO_PA.rapidos} PA`,
  },
  lentos: {
    glifo: "◆",
    teto: `${PISO_PA.lentos}+`,
    descricao: `Declarar turno lento — ações de ${PISO_PA.lentos} PA ou mais`,
  },
};

export function TrilhaFaccoes(props: TrilhaFaccoesProps) {
  const { trilha, tokenPorId, selecionadoId, ehNarrador } = props;
  if (trilha.participantes.length === 0) return null;

  const agindo = trilha.participantes.find((p) => p.id === trilha.agindoId) ?? null;
  const vez = ladoDaVez(trilha);
  const aptos = elegiveisAgora(trilha);
  const janelaAcabou = podeEncerrarJanela(trilha);

  /**
   * Facção realçada. Com alguém agindo é a dele (a ativação em curso
   * é o fato mais forte da tela); sem ninguém agindo, é toda facção
   * que tenha alguém elegível — que já é a resposta do modelo pra
   * alternância, emboscada e lado único restante.
   */
  const faccaoAtiva = (lado: Lado) => (agindo ? agindo.lado === lado : aptos.some((p) => p.lado === lado));

  const estado = agindo
    ? `${agindo.nome} em ação`
    : vez === "pj" ? "Vez dos jogadores"
    : vez === "pn" ? "Vez do narrador"
    : janelaAcabou ? "Janela concluída"
    : "Qualquer lado pode abrir";

  return (
    <>
      <section className="rv-rodadas" aria-label="Rodada e ativação">
        <p className="rv-rodadas-rodada">
          Rodada {trilha.rodada}
          {trilha.modo !== "combate" && (
            <span className="rv-rodadas-modo" data-modo={trilha.modo}>
              {trilha.modo === "emboscada" ? "Emboscada" : trilha.modo === "tregua" ? "Trégua" : "Exploração"}
            </span>
          )}
        </p>
        <p className="rv-rodadas-janela" data-janela={trilha.janela} title={DICA_JANELA[trilha.janela]}>
          {ROTULO_JANELA_CURTO[trilha.janela]} · {limiteDaJanela(trilha.janela)}
        </p>
        <p className="rv-rodadas-estado" data-lado={agindo ? agindo.lado : vez ?? "livre"} role="status" aria-live="polite">
          {estado}
        </p>
        {/* Avançar janela/rodada só aparece quando o modelo diz que
            ninguém mais pode agir nela — e nunca no meio de uma
            ativação aberta (escolha incompatível). */}
        {janelaAcabou && !agindo && (
          <button
            type="button"
            className="rv-btn rv-btn--pri rv-rodadas-avanca"
            onClick={trilha.janela === "rapidos" ? props.onAvancarJanela : props.onProximaRodada}
          >
            {trilha.janela === "rapidos" ? `Resolver ${ROTULO_JANELA_CURTO.lentos}` : "Encerrar rodada"}
          </button>
        )}
      </section>

      {(["pj", "pn"] as Lado[]).map((lado) => (
        <Faccao
          key={lado}
          lado={lado}
          ativa={faccaoAtiva(lado)}
          prontos={aptos.filter((p) => p.lado === lado).length}
          participantes={ordenarTrilho(trilha.participantes.filter((p) => p.lado === lado), trilha)}
          trilha={trilha}
          tokenPorId={tokenPorId}
          selecionadoId={selecionadoId}
          ehNarrador={ehNarrador}
          agindo={agindo}
          onDeclarar={props.onDeclarar}
          onAssumir={props.onAssumir}
          onConcluir={props.onConcluir}
          onEncerrar={props.onEncerrar}
          onFocar={props.onFocar}
        />
      ))}
    </>
  );
}

function Faccao({
  lado, ativa, prontos, participantes, trilha, tokenPorId, selecionadoId, ehNarrador, agindo,
  onDeclarar, onAssumir, onConcluir, onEncerrar, onFocar,
}: {
  lado: Lado; ativa: boolean; prontos: number; participantes: Participante[];
  trilha: EstadoTrilha; tokenPorId: Map<string, TokenApresentacao>; selecionadoId: string | null;
  ehNarrador: boolean; agindo: Participante | null;
  onDeclarar: (id: string, j: Janela) => void; onAssumir: (id: string) => void;
  onConcluir: (pa: number) => void; onEncerrar: (id: string) => void; onFocar: (id: string) => void;
}) {
  return (
    <aside className={`rv-faccao rv-faccao--${lado}`} data-ativa={ativa} aria-label={`${ROTULO_LADO[lado]} — ativação`}>
      <header className="rv-faccao-cab">
        <span className="rv-faccao-nome">{ROTULO_LADO[lado]}</span>
        <span className="rv-faccao-conta" title={`${prontos} prontos nesta janela`}>{prontos}</span>
      </header>
      <span className="rv-faccao-espinha" aria-hidden="true" />
      <ul className="rv-faccao-lista">
        {participantes.map((p) => (
          <Ator
            key={p.id}
            p={p}
            token={tokenPorId.get(p.id)}
            trilha={trilha}
            selecionado={selecionadoId === p.id}
            ehNarrador={ehNarrador}
            outroAgindo={agindo !== null && agindo.id !== p.id ? agindo : null}
            onDeclarar={onDeclarar}
            onAssumir={onAssumir}
            onConcluir={onConcluir}
            onEncerrar={onEncerrar}
            onFocar={onFocar}
          />
        ))}
        {participantes.length === 0 && <li className="rv-faccao-vazio">Sem personagens</li>}
      </ul>
    </aside>
  );
}

function Ator({
  p, token, trilha, selecionado, ehNarrador, outroAgindo,
  onDeclarar, onAssumir, onConcluir, onEncerrar, onFocar,
}: {
  p: Participante; token: TokenApresentacao | undefined; trilha: EstadoTrilha;
  selecionado: boolean; ehNarrador: boolean; outroAgindo: Participante | null;
  onDeclarar: (id: string, j: Janela) => void; onAssumir: (id: string) => void;
  onConcluir: (pa: number) => void; onEncerrar: (id: string) => void; onFocar: (id: string) => void;
}) {
  const el = elegibilidade(p, trilha);
  const situacao = situacaoDe(p, trilha);
  const restante = paRestante(p);
  // Mesma política de controle do dock anterior: jogador escolhe por
  // personagens de jogador, narrador escolhe por qualquer um.
  const podeComandar = p.lado === "pj" || ehNarrador;
  // Espelha o travamento de `declarar` no modelo — quem já resolveu a
  // rodada (e não está voltando de fragmentação) tem declaração
  // consumada, e o botão precisa DIZER isso em vez de virar no-op.
  const declaracaoTravada = (p.agiuEm.length > 0 && p.fragmentouEm === null) || !!p.incapaz || p.encerrou;
  const resolvido = situacao === "agiu" || situacao === "fora";

  const motivoAgir = outroAgindo
    ? `${outroAgindo.nome} está em ação.`
    : !podeComandar ? "Só o narrador pode ativar este personagem."
    : el.motivo?.texto ?? null;

  return (
    <li
      className="rv-ator"
      data-lado={p.lado}
      data-situacao={situacao}
      data-sel={selecionado}
      data-frag={p.fragmentouEm !== null}
    >
      <button
        type="button"
        className="rv-ator-retrato"
        data-vertente={token?.vertente ?? "nenhuma"}
        aria-pressed={selecionado}
        aria-label={`${p.nome} — selecionar e centralizar no mapa`}
        title={`${p.nome} · ${restante}/${p.paTotal} PA${el.apto ? " · pode agir" : el.motivo ? ` · ${el.motivo.texto}` : ""}`}
        onClick={() => onFocar(p.id)}
      >
        {token?.retrato ? <img src={token.retrato} alt="" /> : <span>{token?.sigla ?? p.nome.slice(0, 2).toUpperCase()}</span>}
        {/* PA fragmentado: badge pequeno no retrato, com o que sobrou
            pra gastar no retorno (regra 5). Só existe quando fragmentou
            de verdade — nunca um contador genérico de PA. */}
        {p.fragmentouEm !== null && restante > 0 && (
          <span className="rv-ator-frag" title={`Fragmentou nos turnos ${p.fragmentouEm === "rapidos" ? "rápidos" : "lentos"} — restam ${restante} PA`}>
            {restante}
          </span>
        )}
        {resolvido && <span className="rv-ator-marca" aria-hidden="true">{situacao === "fora" ? "×" : "✓"}</span>}
      </button>

      <div className="rv-ator-acoes">
        {situacao === "agindo" ? (
          <span className="rv-ator-ativo">Ativo</span>
        ) : !resolvido ? (
          <button
            type="button"
            className="rv-ator-agir"
            disabled={!el.apto || !podeComandar || outroAgindo !== null}
            title={el.apto && podeComandar && !outroAgindo ? `Iniciar a ativação de ${p.nome}` : motivoAgir ?? undefined}
            onClick={() => onAssumir(p.id)}
          >
            Agir
          </button>
        ) : null}

        {!resolvido && (
          <div className="rv-ator-declara" role="group" aria-label={`Janela declarada por ${p.nome}`}>
            {(["rapidos", "lentos"] as Janela[]).map((j) => (
              <BotaoDeclarar
                key={j}
                janela={j}
                lado={p.lado}
                ativo={p.declaracao === j}
                desabilitado={declaracaoTravada || !podeComandar}
                onDeclarar={() => onDeclarar(p.id, j)}
              />
            ))}
          </div>
        )}
      </div>

      {situacao === "agindo" && (
        <Resolucao
          paDoTurno={Math.max(1, tetoPaAgora(p, trilha.janela) === Infinity ? restante : tetoPaAgora(p, trilha.janela))}
          onConcluir={onConcluir}
          onPassar={() => onEncerrar(p.id)}
        />
      )}
    </li>
  );
}

/**
 * Resolução da ativação aberta — mora DENTRO do slot de quem está
 * agindo, nunca num rodapé flutuante.
 *
 * NÃO há escolha de quantos PA gastar. O PA da trilha ainda é a
 * constante `PA_PADRAO_TRILHA` (ver `VttClient.tsx`: a trilha nunca
 * teve PA de ficha), então um seletor de 1..N pediria uma decisão sobre
 * um número inventado — e, pior, `concluirTurno` INFERE fragmentação de
 * "sobrou PA podendo gastar mais": um clique num número menor marcaria
 * uma fragmentação que nenhuma regra da mesa autorizou.
 *
 * Concluir gasta o TETO da janela. É o único valor que nunca fabrica
 * fragmentação. `modelo.ts` continua implementando a regra 5 inteira
 * (teto preso à janela de origem, retorno nos Lentos, badge no
 * retrato) — ela volta a ser alcançável assim que o PA vier de ficha,
 * sem mudar nada aqui além de voltar a oferecer a escolha.
 */
function Resolucao({ paDoTurno, onConcluir, onPassar }: { paDoTurno: number; onConcluir: (pa: number) => void; onPassar: () => void }) {
  return (
    <div className="rv-ator-resolucao">
      <button type="button" className="rv-btn rv-btn--pri" onClick={() => onConcluir(paDoTurno)}>Concluir</button>
      <button type="button" className="rv-btn rv-btn--ghost" onClick={onPassar}>Passar</button>
    </div>
  );
}

/**
 * Botão de declaração com dica de hover/foco.
 *
 * A dica NÃO dá pra fazer só com CSS (como o `.rv-dica` da barra de
 * ferramentas): o trilho rola — `overflow-y: auto` em
 * `.rv-faccao-lista` —, e um balão em `position: absolute` seria
 * recortado pela caixa de rolagem exatamente onde ele precisa
 * aparecer, já que a linha de declaração É a borda do trilho.
 * `position: fixed` medido do próprio botão escapa do recorte (nenhum
 * ancestral cria containing block: ninguém no caminho tem `transform`)
 * e reusa o visual do `.rv-dica`.
 *
 * Sem `title`: o balão nativo apareceria por cima deste, com atraso e
 * outro estilo. O texto continua no `aria-label`, íntegro.
 */
function BotaoDeclarar({
  janela, lado, ativo, desabilitado, onDeclarar,
}: {
  janela: Janela; lado: Lado; ativo: boolean; desabilitado: boolean; onDeclarar: () => void;
}) {
  const [dica, setDica] = useState<{ x: number; y: number } | null>(null);
  const d = DECLARACAO[janela];
  // O balão abre pro lado do MAPA em cada trilho — pra fora do palco
  // ele sairia da tela.
  const abrir = (alvo: HTMLElement) => {
    const r = alvo.getBoundingClientRect();
    setDica({ x: lado === "pj" ? r.right + 10 : r.left - 10, y: r.top + r.height / 2 });
  };
  return (
    <>
      <button
        type="button"
        data-janela={janela}
        aria-pressed={ativo}
        disabled={desabilitado}
        aria-label={d.descricao}
        onMouseEnter={(e) => abrir(e.currentTarget)}
        onMouseLeave={() => setDica(null)}
        onFocus={(e) => abrir(e.currentTarget)}
        onBlur={() => setDica(null)}
        onClick={onDeclarar}
      >
        <span aria-hidden="true">{d.glifo}</span>
        {d.teto}
      </button>
      {dica && (
        <span className="rv-dica rv-dica--fixa" data-lado={lado} role="tooltip" style={{ left: dica.x, top: dica.y }}>
          {d.descricao}
        </span>
      )}
    </>
  );
}
