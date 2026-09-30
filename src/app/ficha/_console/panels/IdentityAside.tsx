"use client";

/**
 * Painel lateral esquerdo do Console, na ordem do wireframe: módulo
 * biométrico (retrato), bloco decorado de identidade (nome + ranking
 * de Cobalto), atributos, Integridade, Sobrecarga, Deslocamento, PA e
 * Reações.
 *
 * MÓDULO BIOMÉTRICO: o retrato não é "a foto do personagem", é o
 * leitor do RPI — o Registro Pessoal Imperial, primeiro escalpo de
 * todo cidadão do Império, que produz o ID sináptico usado para
 * autenticar em terminais e sensores da Malha e sustenta a CDI. Daí o
 * cabeçalho com a situação do registro e a leitura dele embaixo.
 * O quadro é QUADRADO por isso: é um leitor, não um retrato com
 * silhueta. Os atributos seguem com a borda poligonal REAL (SVG com
 * `stroke`), que é a forma do Console.
 *
 * O estado do avatar (preview local + erro) vem de fora — o console
 * minimizado (`MinimizedDockContent`) precisa mostrar a MESMA imagem,
 * então o estado não pode viver só aqui.
 *
 * Nenhum valor é calculado aqui — tudo vem de `api` (derivados já
 * resolvidos e ações que a ficha já implementa).
 */

import { Fragment, useEffect, useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { MAX_OVERLOAD_SURGES_PER_DAY, type CharacterAttributes, type PendingRuptureChoice } from "../../../../lib/character";
import { useClickGuard } from "../useClickGuard";
import type { ConsoleApi } from "../types";
import { AvatarUserIcon } from "../avatarIcons";

import { PassoValor } from "./ModoEvolucao";
import { CabecalhoModulo } from "./CabecalhoModulo";
import { DiamondPip } from "../pips";

const ATRIBUTOS: { id: keyof CharacterAttributes; nome: string }[] = [
  { id: "corpo", nome: "Corpo" },
  { id: "mente", nome: "Mente" },
  { id: "animo", nome: "Ânimo" },
];

/**
 * Segmento da trilha de Integridade — paths EXATOS do prompt: "Inicial"
 * tem lado esquerdo reto e direito em diagonal, "Final" o inverso,
 * "Meio" os dois lados em diagonal — formando uma trilha contínua
 * quando emendados com margem negativa de 1px. Não é seta/chevron: é
 * só o resultado dessas diagonais.
 *
 * Cada segmento ocupa exatamente esta largura dentro de UM ÚNICO SVG.
 * Assim o navegador escala a trilha como um todo e não precisa repartir
 * pixels físicos entre vários SVGs flexíveis — origem da irregularidade
 * de rasterização que aparecia entre alguns pares.
 */
const PIP_WIDTH = 21.0833;
const PIP_OUTER: Record<"first" | "middle" | "last", string> = {
  first: "M0 0H17.463L21.0833 14H0L0 0Z",
  middle: "M0 0H17.463L21.0833 14H3.62037L0 0Z",
  last: "M0 0H21.0833V14H3.62037L0 0Z",
};
const PIP_INSET: Record<"first" | "middle" | "last", string> = {
  first: "M17.0752 0.5L20.4375 13.5H0.5V0.5H17.0752Z",
  middle: "M17.0752 0.5L20.4375 13.5H4.00781L0.645508 0.5H17.0752Z",
  last: "M20.583 0.5V13.5H4.00781L0.645508 0.5H20.583Z",
};

function IntegrityPip({
  position,
  cheio,
  fraturado,
  preview,
}: {
  position: "first" | "middle" | "last";
  cheio: boolean;
  fraturado: boolean;
  preview?: "fill" | "empty";
}) {
  if (preview) {
    const fill = preview === "fill" ? "rgba(4, 158, 192, 0.22)" : "rgba(255, 95, 116, 0.14)";
    const stroke = preview === "fill" ? "rgba(0, 212, 255, 0.35)" : "rgba(255, 95, 116, 0.4)";
    return (
      <>
        <path d={PIP_INSET[position]} fill={fill} stroke={stroke} />
      </>
    );
  }
  if (cheio) {
    return (
      <>
        <path d={PIP_OUTER[position]} fill="#049EC0" fillOpacity="0.43" />
        <path d={PIP_INSET[position]} fill="none" stroke="#00D4FF" strokeOpacity="0.18" />
      </>
    );
  }
  if (fraturado) {
    return (
      <>
        <defs>
          <pattern id={`integrity-fracture-${position}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--rc-danger)" strokeOpacity="0.58" strokeWidth="1" />
          </pattern>
        </defs>
        <path d={PIP_INSET[position]} fill={`url(#integrity-fracture-${position})`} stroke="var(--rc-danger)" strokeOpacity="0.42" />
      </>
    );
  }
  return (
    <>
      <path d={PIP_INSET[position]} fill="#123143" fillOpacity="0.2" stroke="#0C3D4E" />
    </>
  );
}

/**
 * Segmento da trilha de Sobrecarga — mesma lógica de diagonais da
 * Integridade, geometria própria (88×12) e paleta âmbar; sempre
 * exatamente 3 (MAX_OVERLOAD_SURGES_PER_DAY), então só usa
 * Inicial/Meio/Final, nunca repete Meio.
 */
const SURGE_OUTER: Record<"first" | "middle" | "last", string> = {
  first: "M0 0H72.3367L87.3333 12H0L0 0Z",
  middle: "M0 0H72.3367L87.3333 12H14.9966L0 0Z",
  last: "M0 0H87.3333V12H14.9966L0 0Z",
};
const SURGE_INSET: Record<"first" | "middle" | "last", string> = {
  first: "M72.1611 0.5L85.9072 11.5H0.5V0.5H72.1611Z",
  middle: "M72.1611 0.5L85.9072 11.5H15.1719L1.42578 0.5H72.1611Z",
  last: "M86.833 0.5V11.5H15.1719L1.42578 0.5H86.833Z",
};

function SurgePip({ position, usada }: { position: "first" | "middle" | "last"; usada: boolean }) {
  return (
    <svg viewBox="0 0 88 12" preserveAspectRatio="none" aria-hidden="true">
      <path d={SURGE_OUTER[position]} fill={usada ? "#483A1A" : "#20221F"} />
      <path d={SURGE_INSET[position]} fill="none" stroke="#A97A30" strokeOpacity="0.55" />
    </svg>
  );
}


/**
 * Container PA/Reações — "serve pra Reações também, é a mesma coisa"
 * (spec). Trilha de losangos + botões minus/plus (±1) lado a lado com
 * o valor atual/total.
 */
export function PointResourceControls({
  rotulo,
  disponivel,
  max,
  onAlternar,
  disabled = false,
  variant = "console",
  leitura = false,
}: {
  rotulo: string;
  disponivel: number;
  max: number;
  onAlternar: (delta: number) => void;
  disabled?: boolean;
  variant?: "console" | "hud";
  /** Ficha só leitura: mostra as cargas e o valor, sem −/+ nem clique nas cargas. */
  leitura?: boolean;
}) {
  const guard = useClickGuard();
  const [hover, setHover] = useState<number | null>(null);
  const total = Math.max(0, Math.round(max));
  const previewValor = hover == null ? null : hover < disponivel ? hover : hover + 1;
  /* CANAL: nome | banco de cargas | controle (− valor +). O bloco era
     empilhado (rótulo em cima, pips e valor embaixo, botão de defesa
     dentro do mesmo container) e ocupava três alturas para dizer duas
     coisas. Em linha, PA e Reações viram duas leituras comparáveis, e
     "Rolar defesa" sai para o pé do card, que é onde uma AÇÃO pertence
     — ela não é um detalhe de Reações. */
  return (
    <div className="rc-acao-canal" data-variant={variant} aria-busy={disabled || undefined}>
      <span className="rc-acao-nome">{rotulo}</span>
      <div className="rc-acao-cargas" onMouseLeave={() => setHover(null)}>
          {total === 0 ? (
            <span className="rc-vazio">—</span>
          ) : (
            Array.from({ length: total }, (_, i) => {
              const cheio = i < disponivel;
              let preview: "fill" | "empty" | undefined;
              if (previewValor != null) {
                if (previewValor > disponivel && i >= disponivel && i < previewValor) preview = "fill";
                else if (previewValor < disponivel && i >= previewValor && i < disponivel) preview = "empty";
              }
              if (leitura) {
                return (
                  <span key={i} className="rc-acao-carga" data-gasta={!cheio || undefined}>
                    <DiamondPip cheio={cheio} size={16} />
                  </span>
                );
              }
              return (
                <button
                  key={i}
                  type="button"
                  className="rc-acao-carga"
                  data-gasta={!cheio || undefined}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  // Mesma lógica de "salto direto" da Trilha de
                  // Integridade — clicar no pip N ajusta pro estado que
                  // o hover já está PREVENDO ali (cheio → volta pra N,
                  // vazio → enche até N+1), num delta só. Antes disso
                  // aqui sempre mandava ±1 (herdado de um clique "sem
                  // posição"), então passar o mouse por vários pips
                  // prometia um salto que o clique não cumpria — cada
                  // clique só tirava/devolvia 1, nunca o previsto.
                  // `onAlternar` soma ao GASTO (não ao disponível), daí
                  // o delta ser "disponível atual − alvo": alvo MAIOR
                  // que o disponível (recuperar) precisa de um delta
                  // NEGATIVO.
                  onClick={() => guard(() => onAlternar(disponivel - (cheio ? i : i + 1)))}
                  disabled={disabled}
                  aria-label={`${rotulo} ${i + 1} de ${total}: ${cheio ? "disponível" : "gasto"}`}
                  aria-pressed={cheio}
                >
                  <DiamondPip cheio={cheio} size={16} preview={preview} />
                </button>
              );
            })
          )}
      </div>
      <div className="rc-acao-ctrl" data-leitura={leitura || undefined}>
        {!leitura && <button
          type="button"
          onClick={() => guard(() => onAlternar(1))}
          disabled={disabled || disponivel <= 0}
          aria-label={`Gastar 1 ${rotulo}`}
        >
          −
        </button>}
        <span className="rc-acao-valor">
          <span className="rc-acao-atual">{disponivel}</span>
          <span className="rc-acao-total">/{total}</span>
        </span>
        {!leitura && <button
          type="button"
          onClick={() => guard(() => onAlternar(-1))}
          disabled={disabled || disponivel >= total}
          aria-label={`Devolver 1 ${rotulo}`}
        >
          +
        </button>}
      </div>
    </div>
  );
}

/** "Rolar defesa" — a ação do card, no pé dele e com a largura toda. */
export function BotaoDefesa({ onRolarDefesa, disabled = false }: { onRolarDefesa: () => void; disabled?: boolean }) {
  const guard = useClickGuard();
  return (
    <button type="button" className="rc-acao-defesa" onClick={() => guard(onRolarDefesa)} disabled={disabled}>
      <span className="rc-acao-defesa-ico" aria-hidden="true">
        <img className="rc-defesa-escudo" src="/console/icons/shield-defense.svg" alt="" />
      </span>
      <span className="rc-acao-defesa-txt">Rolar defesa</span>
    </button>
  );
}

/**
 * Trilha de Integridade: segmentos contíguos (flex:1, sem sobra de
 * espaço), clicáveis, com prévia discreta no hover. Clicar num
 * segmento VAZIO aumenta até ali; clicar num PREENCHIDO reduz para o
 * ponto anterior a ele.
 */
function TrilhaIntegridade({
  atual,
  max,
  onDefinir,
  distorcoes,
  leitura = false,
}: {
  atual: number;
  max: number;
  onDefinir: (valor: number) => void;
  distorcoes: PendingRuptureChoice[];
  /** Ficha só leitura: os segmentos mostram o valor, sem clique nem prévia de ajuste. */
  leitura?: boolean;
}) {
  const guard = useClickGuard();
  const [hover, setHover] = useState<number | null>(null);
  const [expandido, setExpandido] = useState(false);
  const total = Math.max(0, Math.round(max));
  const quantidadeDistorcoes = atual >= 7 ? 0 : atual >= 5 ? 1 : atual >= 3 ? 2 : 3;
  const distorcoesAtivas = distorcoes.filter((item) => item.status === "resolved").slice(-quantidadeDistorcoes).reverse();

  useEffect(() => {
    if (quantidadeDistorcoes === 0) setExpandido(false);
  }, [quantidadeDistorcoes]);

  // Resultado se o segmento sob o mouse (hover) fosse clicado agora.
  const previewValor = hover == null ? null : hover < atual ? hover : hover + 1;

  return (
    <div
      className="rc-nric-integ"
      data-expandivel={quantidadeDistorcoes > 0 || undefined}
      onClick={(event) => {
        if (quantidadeDistorcoes === 0 || (event.target as Element).closest(".rc-nric-pips")) return;
        setExpandido((aberto) => !aberto);
      }}
    >
      <div className="rc-nric-integ-head">
        <span className="rc-nric-integ-label">Integridade</span>
        <span className="rc-nric-integ-val">
          {atual}
          <span className="rc-nric-integ-total">/{total}</span>
        </span>
      </div>
      <svg
        className="rc-nric-pips"
        viewBox={`0 0 ${PIP_WIDTH * total} 14`}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        aria-label={`Integridade: ${atual} de ${total}`}
      >
        {Array.from({ length: total }, (_, i) => {
          const cheio = i < atual;
          let preview: "fill" | "empty" | undefined;
          if (previewValor != null) {
            if (previewValor > atual && i >= atual && i < previewValor) preview = "fill";
            else if (previewValor < atual && i >= previewValor && i < atual) preview = "empty";
          }
          const position: "first" | "middle" | "last" = i === 0 ? "first" : i === total - 1 ? "last" : "middle";
          if (leitura) {
            return (
              <g key={i} className="rc-nric-pip" data-leitura="true" transform={`translate(${i * PIP_WIDTH} 0)`}>
                <IntegrityPip position={position} cheio={cheio} fraturado={!cheio && atual < 7 && i < 7} />
              </g>
            );
          }
          return (
            <g
              key={i}
              className="rc-nric-pip"
              transform={`translate(${i * PIP_WIDTH} 0)`}
              tabIndex={0}
              role="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => guard(() => onDefinir(cheio ? i : i + 1))}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                guard(() => onDefinir(cheio ? i : i + 1));
              }}
              aria-label={`Integridade — segmento ${i + 1} de ${total}: ${cheio ? "preenchido" : "vazio"}. Clique para ajustar até aqui.`}
            >
              <IntegrityPip position={position} cheio={cheio} fraturado={!cheio && atual < 7 && i < 7} preview={preview} />
              <rect className="rc-nric-pip-hit" width={PIP_WIDTH} height={14} />
            </g>
          );
        })}
      </svg>
      {quantidadeDistorcoes > 0 && (
        <>
          <div className="rc-nric-integ-footer">
            <button
              type="button"
              className="rc-nric-distorcao-toggle"
              aria-expanded={expandido}
              aria-controls="rc-nric-distorcoes"
            >
              {quantidadeDistorcoes} {quantidadeDistorcoes === 1 ? "DISTORÇÃO" : "DISTORÇÕES"}
              <span className="rc-nric-distorcao-chevron" aria-hidden="true" />
            </button>
          </div>
          <div id="rc-nric-distorcoes" className="rc-nric-distorcoes" hidden={!expandido}>
            {Array.from({ length: quantidadeDistorcoes }, (_, indice) => {
              const distorcao = distorcoesAtivas[indice];
              const nome = distorcao?.traco || distorcao?.marca || "Distorção não registrada";
              return (
                <div className="rc-nric-distorcao" key={distorcao?.id ?? `distorcao-${indice}`}>
                  <span className="rc-nric-distorcao-indice">{String(indice + 1).padStart(2, "0")}</span>
                  <span className="rc-nric-distorcao-nome" title={nome}>{nome}</span>
                  <span className="rc-nric-distorcao-estado">ATIVA</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Situação do RPI (livro: Registro Pessoal Imperial). O modelo de
 * personagem ainda NÃO guarda esse campo — `escalpos_instalados`
 * (lib/character/escalpos.ts) tem instância + slug, sem situação —,
 * então o padrão é "integro" e quem tiver o dado passa por prop.
 */
export type SituacaoRpi = "integro" | "sinalizado" | "comprometido";

const SELO_RPI: Record<SituacaoRpi, string> = {
  integro: "RPI ÍNTEGRO ●",
  sinalizado: "RPI SINALIZADO ▲",
  comprometido: "RPI COMPROMETIDO ✕",
};

/**
 * Nível do RPI — a profundidade da identidade, comparada ao Protocolo
 * de Verificação do sistema: 1 Básico, 2 Cruzado, 3 Profundo. Como a
 * situação, ainda não é campo do personagem; entra por prop.
 */
export type NivelRpi = 1 | 2 | 3;

/**
 * A LEITURA do registro: o que ele é (nível) e o que a Malha responde
 * sobre ele. Duas linhas — o ID sináptico e a CDI saíram porque são
 * consequência do vínculo, não leitura própria: com o vínculo ativo os
 * dois funcionam, e com ele bloqueado os dois caem junto.
 */
function leituraRpi(situacao: SituacaoRpi, nivel: NivelRpi): [string, string][] {
  const vinculo = { integro: "Ativo", sinalizado: "Em revisão", comprometido: "Bloqueado" }[situacao];
  return [
    ["RPI", `Nível ${nivel}`],
    ["Vínculo Malha", vinculo],
  ];
}

/**
 * NOME DA PERSONAGEM — campo, não rótulo.
 *
 * Ele era um `<span>`: para corrigir um erro de digitação a pessoa
 * tinha de sair do Console e achar o campo na ficha clássica. Agora é
 * um `<input>` que parece texto até se mexer nele — o fio embaixo
 * aparece no hover, acende no foco e fica aceso enquanto houver
 * alteração não gravada.
 *
 * GRAVA no blur e no Enter; Escape devolve o valor anterior. Nome
 * vazio não grava: volta ao que era, porque "sem nome" é um estado de
 * ficha nova, não uma escolha que se faz apagando o campo.
 *
 * O estado local existe porque o campo é controlado pela digitação e
 * só devolve ao personagem quando confirma — sem isso, cada tecla
 * viraria uma gravação.
 */
function CampoNome({ nome, onGravar }: { nome: string; onGravar: (nome: string) => void }) {
  const [texto, setTexto] = useState(nome);
  const [salvo, setSalvo] = useState(0);
  /* O que já foi gravado, lido SEM esperar o próximo render. Enter
     grava e tira o foco, e o `blur` que vem logo atrás chamaria
     `gravar()` de novo com o `nome` da prop ainda desatualizado — duas
     gravações do mesmo nome, duas entradas no log. */
  const gravado = useRef(nome);

  // Trocar de personagem com o campo aberto deixaria o nome do
  // anterior pendurado ali.
  useEffect(() => {
    setTexto(nome);
    gravado.current = nome;
  }, [nome]);

  function gravar() {
    const limpo = texto.trim();
    if (limpo === "" || limpo === gravado.current) {
      setTexto(gravado.current);
      return;
    }
    gravado.current = limpo;
    onGravar(limpo);
    setTexto(limpo);
    setSalvo((n) => n + 1);
  }

  return (
    <span
      className="rc-nric-nome-campo"
      data-sujo={texto.trim() !== gravado.current || undefined}
      // `data-salvo` + `key` no input: a gravação REMONTA o campo, e é
      // isso que faz a animação de "gravado" rodar de novo a cada vez.
      // Sem o atributo (que só existe a partir da 1ª gravação) ela
      // dispararia também na montagem inicial, piscando ao abrir o
      // Console.
      data-salvo={salvo || undefined}
    >
      <input
        key={salvo}
        className="rc-nric-nome"
        value={texto}
        maxLength={60}
        autoComplete="off"
        spellCheck={false}
        data-no-drag
        aria-label="Nome da personagem"
        placeholder="Sem nome"
        onChange={(e) => setTexto(e.target.value)}
        onBlur={gravar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            gravar();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setTexto(gravado.current);
            e.currentTarget.blur();
          }
        }}
      />
    </span>
  );
}

export function IdentityAside({
  api,
  avatarUrl,
  avatarErro,
  onAvatarChange,
  onAvatarRemover,
  avatarOcupado,
  onRolarAtributo,
  onEscolherSurto,
  onRolarDefesa,
  situacaoRpi = "integro",
  nivelRpi = 1,
}: {
  api: ConsoleApi;
  avatarUrl: string | null;
  avatarErro: string | null;
  onAvatarChange: (file: File) => void;
  /** Desfaz o vínculo do avatar. Sem ela, o botão de remover não aparece. */
  onAvatarRemover?: () => void;
  /** Envio ou remoção em voo — trava os dois gestos. */
  avatarOcupado?: boolean;
  onRolarAtributo: (id: keyof CharacterAttributes) => void;
  onEscolherSurto: () => void;
  onRolarDefesa: () => void;
  /** Situação do RPI. Fixa em "integro" enquanto o modelo não guardar o campo. */
  situacaoRpi?: SituacaoRpi;
  /** Nível do RPI (Protocolo de Verificação). Fixo em 1 pelo mesmo motivo. */
  nivelRpi?: NivelRpi;
}) {
  const { character, derivados } = api;
  const guard = useClickGuard();
  /* SÓ LEITURA (permissão "visualizar"): os controles de edição e de
     ação não são renderizados; o que é leitura — valores, dicas, hover
     — continua. */
  const leitura = !!api.somenteLeitura;

  const integridade = character.recursos_atuais?.integridade ?? derivados.integridade_max;
  const paDisponivel = Math.max(0, derivados.pa_max - (character.estado_jogo?.pa_gastos ?? 0));
  const reacoesDisponiveis = Math.max(0, derivados.reacoes_por_rodada - (character.estado_jogo?.reacoes_usadas ?? 0));
  const sobrecarga = character.sobrecarga_usada_dia ?? 0;
  const ranking = (character.metadados?.ranking_cobalto as string | undefined) ?? null;

  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  /* Trocar de personagem com a pergunta aberta a deixaria pendurada
     sobre o avatar do próximo. */
  useEffect(() => { setConfirmandoRemocao(false); }, [avatarUrl]);

  function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onAvatarChange(file);
    e.target.value = "";
  }

  return (
    <aside className="rc-aside">
      {/* UM card só: cabeçalho do leitor, retrato, nome e ranking, a
          leitura do RPI e então os atributos e a Integridade. Eram
          dois cards empilhados — retrato num, identidade no outro —,
          e o que separava os dois era uma borda a mais no meio de uma
          coisa só: a pessoa registrada e o registro dela.

          Cabeçalho e leitura são irmãos do quadro, em fluxo, não
          camadas por cima dele: sobrepostos, o retrato vazava por
          baixo do texto em qualquer altura que não fosse a prevista. */}
      <div className="rc-nric-card" data-rpi={situacaoRpi}>
      <CabecalhoModulo id="ID://BIOMÉTRICO">
        <span className="rc-bio-selo">{SELO_RPI[situacaoRpi]}</span>
      </CabecalhoModulo>
      <div className="rc-avatar-wrap">
      {leitura ? (
        <div className="rc-avatar rc-avatar--leitura" data-no-drag>
          <span className="rc-avatar-fill">
            {avatarUrl && <img src={avatarUrl} alt="" />}
            {!avatarUrl && (
              <span className="rc-avatar-ico rc-avatar-ico--user" aria-hidden="true">
                <AvatarUserIcon />
              </span>
            )}
          </span>
        </div>
      ) : (
      <label className="rc-avatar" data-no-drag>
        <span className="rc-avatar-fill">
          {avatarUrl && <img src={avatarUrl} alt="" />}
          {!avatarUrl && (
            <span className="rc-avatar-ico rc-avatar-ico--user" aria-hidden="true">
              <AvatarUserIcon />
            </span>
          )}
          {/* Um único affordance de upload nos dois estados: a foto ou a
              silhueta continuam sendo o conteúdo do quadro, enquanto o
              mesmo véu e ícone aparecem no hover/foco para indicar a
              ação de escolher outra imagem. */}
          <span className="rc-avatar-troca" aria-hidden="true">
            <ImageUp size={22} strokeWidth={1.6} />
          </span>
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={aoEscolherArquivo}
          hidden
          aria-label="Trocar avatar do personagem"
          disabled={avatarOcupado}
        />
      </label>
      )}
      {/* REMOVER fica FORA do `<label>`: dentro dele, qualquer clique
          — inclusive no botão — abriria o seletor de arquivo, e
          conteúdo interativo dentro de `label` é inválido. Só aparece
          com imagem e no hover/foco do conjunto, como o lápis de edição
          rápida das áreas no mapa. */}
      {avatarUrl && onAvatarRemover && !confirmandoRemocao && !leitura && (
        <button
          type="button"
          className="rc-avatar-remover"
          onClick={() => setConfirmandoRemocao(true)}
          disabled={avatarOcupado}
          aria-label="Remover avatar do personagem"
          title="Remover avatar"
          data-testid="console-avatar-remover"
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      )}
      {/* CONFIRMAÇÃO em dois passos, como a exclusão de objeto no VTT
          (`PainelObjetos`): a pergunta cobre o próprio avatar, porque é
          dele que se está falando, e só sai por uma das duas respostas
          — tirar o mouse não decide nada. */}
      {confirmandoRemocao && (
        <div className="rc-avatar-confirmar" role="alertdialog" aria-label="Confirmar remoção do avatar">
          <p>Remover o avatar?</p>
          <div className="rc-avatar-confirmar-acoes">
            <button
              type="button" className="rc-avatar-confirmar-sim" disabled={avatarOcupado}
              onClick={() => { setConfirmandoRemocao(false); onAvatarRemover?.(); }}
              data-testid="console-avatar-remover-confirmar"
            >
              <Trash2 size={12} aria-hidden="true" /> Remover
            </button>
            <button
              type="button" className="rc-avatar-confirmar-nao" disabled={avatarOcupado}
              onClick={() => setConfirmandoRemocao(false)}
            >
              Manter
            </button>
          </div>
        </div>
      )}
      </div>
      {avatarErro && (
        <p className="rc-vazio" role="alert" style={{ color: "#ffc4cf" }}>
          {avatarErro}
        </p>
      )}

        <div className="rc-nric-nome-row">
          {leitura ? (
            <span className="rc-nric-nome" title={character.nome}>{character.nome}</span>
          ) : (
            <CampoNome nome={character.nome} onGravar={api.editarNome} />
          )}
          <span
            className="rc-nric-badge"
            data-vazio={!ranking}
            title={ranking ? `Ranking de Cobalto ${ranking}` : "Ranking de Cobalto não definido"}
          >
            {ranking ?? "—"}
          </span>
        </div>

        {/* A leitura vem DEPOIS do nome: primeiro quem a pessoa diz
            ser, depois o que o registro responde sobre isso. */}
        <dl className="rc-bio-leitura">
          {leituraRpi(situacaoRpi, nivelRpi).map(([campo, valor]) => (
            <Fragment key={campo}>
              <dt>{campo}</dt>
              <dd>{valor}</dd>
            </Fragment>
          ))}
        </dl>

        {/* MATRIZ — três células de larguras iguais, divididas por fio,
            sangrando até a borda do card. O heptágono saiu: com três
            deles lado a lado, a forma era o que se via primeiro e o
            número, que é o dado, vinha depois. Agora a cor do atributo
            vive num traço curto no topo da célula e no nome; o valor
            manda no tamanho. */}
        <div className="rc-nric-attrs" data-evolucao={api.modo === "evolucao" ? "true" : undefined}>
          {ATRIBUTOS.map(({ id, nome }) => {
            const valor = character.atributos[id];
            const def = api.regras?.atributos.find((a) => a.id === id);
            const min = def?.valor_minimo ?? 1;
            const max = def?.valor_maximo ?? 5;

            // Em Modo Evolução o card deixa de ser "rolar" e vira
            // "ajustar": clicar no card inteiro rolaria por engano no
            // meio de uma edição, então ele vira `<div>` e quem age são
            // os dois passos.
            if (api.modo === "evolucao") {
              return (
                <div key={id} className="rc-nric-attr" data-attr={id} data-editando="true" data-testid={`console-attr-${id}`}>
                  <span className="rc-nric-attr-nome">{nome}</span>
                  <PassoValor
                    valor={valor}
                    min={min}
                    max={max}
                    rotulo={nome}
                    onDefinir={(novo) => api.editarAtributo(id, novo)}
                    testId={`console-attr-passo-${id}`}
                  />
                </div>
              );
            }

            return (
              <button
                key={id}
                type="button"
                className="rc-nric-attr"
                data-attr={id}
                // Só leitura: o card continua (valor, hover), mas não rola.
                onClick={leitura ? undefined : () => onRolarAtributo(id)}
                data-leitura={leitura || undefined}
                data-testid={`console-attr-${id}`}
                aria-label={`Rolar ${nome}: ${valor}d8`}
              >
                <span className="rc-nric-attr-nome">{nome}</span>
                <span className="rc-nric-attr-val">{valor}</span>
              </button>
            );
          })}
        </div>

        {/* Deslocamento é leitura DOS ATRIBUTOS (sai de Corpo), então
            fica logo abaixo deles em vez de virar um card avulso no
            fim da coluna. */}
        <div className="rc-nric-faixa rc-ndesl-card">
          <span className="rc-ndesl-label">Deslocamento</span>
          <span className="rc-ndesl-val">
            <span className="rc-ndesl-medida" tabIndex={0} aria-label={`${derivados.andar_m} metros, andar`}>
              {derivados.andar_m}m
              <span className="rc-ndesl-dica" role="tooltip">Andar</span>
            </span>
            <span className="rc-ndesl-separador" aria-hidden="true"> · </span>
            <span className="rc-ndesl-medida rc-ndesl-correr" tabIndex={0} aria-label={`${derivados.correr_m} metros, correr`}>
              {derivados.correr_m}m
              <span className="rc-ndesl-dica" role="tooltip">Correr</span>
            </span>
          </span>
        </div>

        <TrilhaIntegridade
          atual={integridade}
          max={derivados.integridade_max}
          onDefinir={api.editarIntegridade}
          distorcoes={character.pending_rupture_choices ?? []}
          leitura={leitura}
        />

        {/* Sobrecarga logo abaixo da Integridade: é o recurso que se
            gasta ao custo dela. */}
        <div className="rc-nric-faixa rc-nsob-card">
        <div className="rc-nsob-head">
          <span className="rc-nsob-label">Sobrecarga</span>
          <span className="rc-nsob-val">
            {sobrecarga}
            <span className="rc-nsob-total">/{MAX_OVERLOAD_SURGES_PER_DAY}</span>
          </span>
        </div>
        <div className="rc-nsob-pips">
          {Array.from({ length: MAX_OVERLOAD_SURGES_PER_DAY }, (_, i) => {
            const usada = i < sobrecarga;
            const position: "first" | "middle" | "last" =
              i === 0 ? "first" : i === MAX_OVERLOAD_SURGES_PER_DAY - 1 ? "last" : "middle";
            if (leitura) {
              return (
                <span key={i} className="rc-nsob-pip" aria-label={`Sobrecarga ${i + 1} de ${MAX_OVERLOAD_SURGES_PER_DAY}${usada ? " (usada)" : ""}`}>
                  <SurgePip position={position} usada={usada} />
                </span>
              );
            }
            return (
              <button
                key={i}
                type="button"
                className="rc-nsob-pip"
                disabled={usada || !api.podeUsarSobrecarga}
                onClick={() => guard(onEscolherSurto)}
                data-testid={`console-surto-${i + 1}`}
                aria-label={`Sobrecarga ${i + 1} de ${MAX_OVERLOAD_SURGES_PER_DAY}${usada ? " (usada)" : ""}`}
              >
                <SurgePip position={position} usada={usada} />
              </button>
            );
          })}
        </div>
        </div>
      </div>

      <div className="rc-npr-card">
        <CabecalhoModulo id="ID://AÇÕES" mod="MOD.ACTION // 04" />
        <PointResourceControls rotulo="PA" disponivel={paDisponivel} max={derivados.pa_max} onAlternar={api.ajustarPa} leitura={leitura} />
        <PointResourceControls
          rotulo="Reações"
          disponivel={reacoesDisponiveis}
          max={derivados.reacoes_por_rodada}
          onAlternar={api.ajustarReacoes}
          leitura={leitura}
        />
        {!leitura && <BotaoDefesa onRolarDefesa={onRolarDefesa} />}
      </div>
    </aside>
  );
}
