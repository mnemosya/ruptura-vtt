"use client";

/**
 * Painel lateral esquerdo do Console, na ordem do wireframe: avatar,
 * bloco decorado de identidade (nome + ranking de Cobalto), atributos,
 * Integridade, Sobrecarga, Deslocamento, PA e Reações.
 *
 * Avatar e atributos usam borda poligonal REAL (SVG com `stroke`), não
 * `clip-path` sobre um retângulo com `border` — essa combinação é o
 * que produzia os "nubs" quadrados nos cantos. O avatar guarda a
 * imagem/placeholder numa camada separada (clip-path só para recortar
 * a foto, sem borda própria); os atributos usam um único polígono SVG
 * com fill+stroke (sem foto para recortar, então uma camada basta).
 *
 * O estado do avatar (preview local + erro) vem de fora — o console
 * minimizado (`MinimizedDockContent`) precisa mostrar a MESMA imagem,
 * então o estado não pode viver só aqui.
 *
 * Nenhum valor é calculado aqui — tudo vem de `api` (derivados já
 * resolvidos e ações que a ficha já implementa).
 */

import { useEffect, useState } from "react";
import { ImageUp, Shield, Trash2 } from "lucide-react";
import { MAX_OVERLOAD_SURGES_PER_DAY, type CharacterAttributes } from "../../../../lib/character";
import { useClickGuard } from "../useClickGuard";
import type { ConsoleApi } from "../types";
import { AvatarUserIcon, AvatarHexPolygon } from "../avatarIcons";
import { AttrHexPolygon, ATTR_ICONS, ATTR_LABEL_COLOR } from "../attrIcons";
import { PassoValor } from "./ModoEvolucao";
import { DiamondPip } from "../pips";
import { DecoTop } from "../deco";

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
 * O viewBox é 21.0833 de largura (não 22): 21.0833 é o x máximo real
 * de TODOS os paths, e os 0.9167 a mais que o prompt trazia viravam
 * espaço morto à direita de cada pip. Nos pips "Inicial"/"Meio" isso
 * passava batido porque o overlap de -1px com o pip seguinte cobria a
 * sobra; no ÚLTIMO não há pip depois, então a borda direita dele
 * ficava recuada pra dentro da caixa e lia como "cortada".
 */
const PIP_VIEWBOX = "0 0 21.0833 14";
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
  preview,
}: {
  position: "first" | "middle" | "last";
  cheio: boolean;
  preview?: "fill" | "empty";
}) {
  if (preview) {
    const fill = preview === "fill" ? "rgba(4, 158, 192, 0.22)" : "rgba(255, 95, 116, 0.14)";
    const stroke = preview === "fill" ? "rgba(0, 212, 255, 0.35)" : "rgba(255, 95, 116, 0.4)";
    return (
      <svg viewBox={PIP_VIEWBOX} preserveAspectRatio="none" aria-hidden="true">
        <path d={PIP_INSET[position]} fill={fill} stroke={stroke} />
      </svg>
    );
  }
  if (cheio) {
    return (
      <svg viewBox={PIP_VIEWBOX} preserveAspectRatio="none" aria-hidden="true">
        <path d={PIP_OUTER[position]} fill="#049EC0" fillOpacity="0.43" />
        <path d={PIP_INSET[position]} fill="none" stroke="#00D4FF" strokeOpacity="0.18" />
      </svg>
    );
  }
  return (
    <svg viewBox={PIP_VIEWBOX} preserveAspectRatio="none" aria-hidden="true">
      <path d={PIP_INSET[position]} fill="#123143" fillOpacity="0.2" stroke="#0C3D4E" />
    </svg>
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


function MinusIcon() {
  return (
    <svg viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M2.2915 5.5H8.70817" stroke="#418292" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M2.2915 5.50033H8.70817M5.49984 2.29199V8.70866" stroke="#418292" strokeLinecap="round" strokeLinejoin="round" />
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
  onRolarDefesa,
  disabled = false,
  variant = "console",
}: {
  rotulo: string;
  disponivel: number;
  max: number;
  onAlternar: (delta: number) => void;
  /** Só o bloco de Reações recebe isso — botão "Rolar defesa" logo
      abaixo dos pips/valor, dentro do MESMO container (spec "botão
      Rolar defesa"). Opcional pra não afetar o bloco de PA. */
  onRolarDefesa?: () => void;
  disabled?: boolean;
  variant?: "console" | "hud";
}) {
  const guard = useClickGuard();
  const [hover, setHover] = useState<number | null>(null);
  const total = Math.max(0, Math.round(max));
  const previewValor = hover == null ? null : hover < disponivel ? hover : hover + 1;
  return (
    <div className="rc-npr" data-variant={variant} aria-busy={disabled || undefined}>
      <span className="rc-npr-label">{rotulo}</span>
      <div className="rc-npr-row">
        <div className="rc-npr-pips" onMouseLeave={() => setHover(null)}>
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
              return (
                <button
                  key={i}
                  type="button"
                  className="rc-npr-pip"
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
                  <DiamondPip cheio={cheio} size={19} preview={preview} />
                </button>
              );
            })
          )}
        </div>
        <div className="rc-npr-valor">
          <button
            type="button"
            className="rc-npr-btn"
            onClick={() => guard(() => onAlternar(1))}
            disabled={disabled || disponivel <= 0}
            aria-label={`Gastar 1 ${rotulo}`}
          >
            <MinusIcon />
          </button>
          <span className="rc-npr-num">
            <span className="rc-npr-num-linha">
              {disponivel}
              <span className="rc-npr-num-total">/{total}</span>
            </span>
          </span>
          <button
            type="button"
            className="rc-npr-btn"
            onClick={() => guard(() => onAlternar(-1))}
            disabled={disabled || disponivel >= total}
            aria-label={`Devolver 1 ${rotulo}`}
          >
            <PlusIcon />
          </button>
        </div>
      </div>
      {onRolarDefesa && (
        <button type="button" className="rc-npr-defesa" onClick={() => guard(onRolarDefesa)} disabled={disabled} aria-label="Rolar defesa">
          <Shield size={14} strokeWidth={1.5} color="#0485A3" fill="rgba(4, 133, 163, 0.33)" aria-hidden="true" />
          Rolar defesa
        </button>
      )}
    </div>
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
}: {
  atual: number;
  max: number;
  onDefinir: (valor: number) => void;
}) {
  const guard = useClickGuard();
  const [hover, setHover] = useState<number | null>(null);
  const total = Math.max(0, Math.round(max));

  // Resultado se o segmento sob o mouse (hover) fosse clicado agora.
  const previewValor = hover == null ? null : hover < atual ? hover : hover + 1;

  return (
    <div className="rc-nric-integ">
      <div className="rc-nric-integ-head">
        <span className="rc-nric-integ-label">Integridade</span>
        <span className="rc-nric-integ-val">
          {atual}
          <span className="rc-nric-integ-total">/{total}</span>
        </span>
      </div>
      <div className="rc-nric-pips" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: total }, (_, i) => {
          const cheio = i < atual;
          let preview: "fill" | "empty" | undefined;
          if (previewValor != null) {
            if (previewValor > atual && i >= atual && i < previewValor) preview = "fill";
            else if (previewValor < atual && i >= previewValor && i < atual) preview = "empty";
          }
          const position: "first" | "middle" | "last" = i === 0 ? "first" : i === total - 1 ? "last" : "middle";
          return (
            <button
              key={i}
              type="button"
              className="rc-nric-pip"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => guard(() => onDefinir(cheio ? i : i + 1))}
              aria-label={`Integridade — segmento ${i + 1} de ${total}: ${cheio ? "preenchido" : "vazio"}. Clique para ajustar até aqui.`}
            >
              <IntegrityPip position={position} cheio={cheio} preview={preview} />
            </button>
          );
        })}
      </div>
    </div>
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
}) {
  const { character, derivados } = api;
  const guard = useClickGuard();

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
      <div className="rc-avatar-wrap">
      <label className="rc-avatar" data-no-drag>
        <span className="rc-avatar-fill">
          {avatarUrl && <img src={avatarUrl} alt="" />}
          {!avatarUrl && (
            <span className="rc-avatar-ico rc-avatar-ico--user" aria-hidden="true">
              <AvatarUserIcon />
            </span>
          )}
          {/* VÉU DE TROCA — só quando JÁ HÁ imagem, e é o mesmo gesto do
              retrato do HUD (`.rv-hud-portrait__lapis`): a imagem é o
              alvo, e o ícone de trocar aparece por cima dela no hover.
              Vazio, o hover continua como era — ali o ícone de usuário
              já ocupa o centro e um véu por cima dele não diria nada
              que o próprio quadro vazio não diga. */}
          {avatarUrl && (
            <span className="rc-avatar-troca" aria-hidden="true">
              <ImageUp size={22} strokeWidth={1.6} />
            </span>
          )}
        </span>
        <AvatarHexPolygon />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={aoEscolherArquivo}
          hidden
          aria-label="Trocar avatar do personagem"
          disabled={avatarOcupado}
        />
      </label>
      {/* REMOVER fica FORA do `<label>`: dentro dele, qualquer clique
          — inclusive no botão — abriria o seletor de arquivo, e
          conteúdo interativo dentro de `label` é inválido. Só aparece
          com imagem e no hover/foco do conjunto, como o lápis de edição
          rápida das áreas no mapa. */}
      {avatarUrl && onAvatarRemover && !confirmandoRemocao && (
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

      <div className="rc-nric-card">
        <DecoTop />
        <div className="rc-nric-nome-row">
          <span className="rc-nric-nome" title={character.nome || "Sem nome"}>
            {character.nome || "Sem nome"}
          </span>
          <span
            className="rc-nric-badge"
            data-vazio={!ranking}
            title={ranking ? `Ranking de Cobalto ${ranking}` : "Ranking de Cobalto não definido"}
          >
            {ranking ?? "—"}
          </span>
        </div>

        <div className="rc-nric-attrs" data-evolucao={api.modo === "evolucao" ? "true" : undefined}>
          {ATRIBUTOS.map(({ id, nome }) => {
            const Icone = ATTR_ICONS[id];
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
                  <AttrHexPolygon attr={id} />
                  <span className="rc-nric-attr-content">
                    <span className="rc-nric-attr-ico" style={{ color: ATTR_LABEL_COLOR[id] }} aria-hidden="true">
                      <Icone />
                    </span>
                    <span className="rc-nric-attr-nome" style={{ color: ATTR_LABEL_COLOR[id] }}>
                      {nome}
                    </span>
                    <PassoValor
                      valor={valor}
                      min={min}
                      max={max}
                      rotulo={nome}
                      onDefinir={(novo) => api.editarAtributo(id, novo)}
                      testId={`console-attr-passo-${id}`}
                    />
                  </span>
                </div>
              );
            }

            return (
              <button
                key={id}
                type="button"
                className="rc-nric-attr"
                data-attr={id}
                onClick={() => onRolarAtributo(id)}
                data-testid={`console-attr-${id}`}
                aria-label={`Rolar ${nome}: ${valor}d8`}
              >
                <AttrHexPolygon attr={id} />
                <span className="rc-nric-attr-content">
                  <span className="rc-nric-attr-ico" style={{ color: ATTR_LABEL_COLOR[id] }} aria-hidden="true">
                    <Icone />
                  </span>
                  <span className="rc-nric-attr-nome" style={{ color: ATTR_LABEL_COLOR[id] }}>
                    {nome}
                  </span>
                  <span className="rc-nric-attr-val">{valor}</span>
                </span>
              </button>
            );
          })}
        </div>

        <TrilhaIntegridade atual={integridade} max={derivados.integridade_max} onDefinir={api.editarIntegridade} />
      </div>

      <div className="rc-nsob-card">
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

      <div className="rc-ndesl-card">
        <span className="rc-ndesl-label">Deslocamento</span>
        <span className="rc-ndesl-val">
          {derivados.andar_m}m<span className="rc-ndesl-correr"> · {derivados.correr_m}m</span>
        </span>
      </div>

      <div className="rc-npr-card">
        <PointResourceControls rotulo="PA" disponivel={paDisponivel} max={derivados.pa_max} onAlternar={api.ajustarPa} />
        <PointResourceControls
          rotulo="Reações"
          disponivel={reacoesDisponiveis}
          max={derivados.reacoes_por_rodada}
          onAlternar={api.ajustarReacoes}
          onRolarDefesa={onRolarDefesa}
        />
      </div>
    </aside>
  );
}
