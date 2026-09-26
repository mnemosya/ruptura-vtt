"use client";

/**
 * Colapso + Recursos v2 (spec Figma) — Colapso é um card único
 * (label + pips losangulares + badge de morte/coma + botão
 * Estabilizar); Recursos segue o mesmo padrão em 3 camadas de
 * Perícias (Card externo → Box título → Card interno), com uma linha
 * por recurso (badge do ícone, barra contínua e valor editável com
 * botões −/+).
 *
 * A edição do valor usa `ResourceValueCard` (compartilhado com o
 * console minimizado — `MinimizedDockContent`) para não duplicar a
 * lógica de parsing/gravação; os botões −/+ do prompt são um atalho
 * de ±1 em cima da mesma ação (`editarRecurso` grava valor absoluto).
 */

import { useEffect, useRef, useState } from "react";
import { Brain, Eye, EyeOff, HeartPulse, Zap } from "lucide-react";
import { MAX_COLLAPSE_SEGMENTS, pisoPeNegativo } from "../../../../lib/character";
import { useClickGuard } from "../useClickGuard";
import { CabecalhoModulo } from "./CabecalhoModulo";
import { ResourceValueCard } from "./ResourceValueCard";
import type { ConsoleApi, RecursoEditavel } from "../types";

export const CONSOLE_RESOURCE_DEFINITIONS: { id: RecursoEditavel; rotulo: string; corTexto: string; corBarra: string; corVazado: string; bgBadge: string; Icone: typeof Zap; avisa: boolean }[] = [
  // `avisa`: se a leitura baixa é um ALARME. PV e PE caindo é o corpo
  // falhando; Mana baixa é só Mana gasta — é assim que o recurso se
  // usa, e marcar isso como crítico ensinaria a ignorar o alarme.
  { id: "pv", rotulo: "PV", corTexto: "#FF5F74", corBarra: "rgba(196, 75, 95, 0.72)", corVazado: "185, 81, 98", bgBadge: "rgba(185, 81, 98, 0.10)", Icone: HeartPulse, avisa: true },
  { id: "pe", rotulo: "PE", corTexto: "#8B5CF6", corBarra: "rgba(123, 85, 190, 0.72)", corVazado: "115, 88, 173", bgBadge: "rgba(115, 88, 173, 0.10)", Icone: Brain, avisa: true },
  { id: "mana", rotulo: "Mana", corTexto: "#00D4FF", corBarra: "rgba(28, 150, 175, 0.72)", corVazado: "37, 138, 160", bgBadge: "rgba(37, 138, 160, 0.10)", Icone: Zap, avisa: false },
];

function MinusIcon() {
  return (
    <svg viewBox="0 0 11 11" fill="none" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M2.2915 4.99984H8.70817V5.99984H2.2915V4.99984Z" fill="#418292" />
    </svg>
  );
}

function PlusIcon() {
  return (
    // Preenchido, não dois traços cruzados: no cruzamento o
    // antialiasing das duas linhas se soma e o miolo do sinal fica
    // mais sólido que os braços, lendo como outra cor. Mesma razão
    // do "+" de Equipamento e do conjunto em `_design/icons`.
    <svg viewBox="0 0 11 11" fill="none" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M4.99984 2.2915H5.99984V4.99984H8.70817V5.99984H5.99984V8.70817H4.99984V5.99984H2.2915V4.99984H4.99984V2.2915Z" fill="#418292" />
    </svg>
  );
}

export interface ConsoleResourceValue {
  id: RecursoEditavel;
  atual: number;
  max: number;
  /** So existe para quem pode administrar a exposicao publica. */
  publico?: boolean;
  pendente?: boolean;
}

/* ── Osciloscópio (variante CONSOLE) ────────────────────────────────
   Cada recurso é um CANAL de leitura: um traço que percorre o canal
   até a fração atual e para, com a marca de 50% desenhada no meio e a
   zona de déficit hachurada entre o valor e essa marca.

   Só no Console. O HUD do token continua com as barras de pip — ali a
   linha tem 22px de altura e um osciloscópio não teria onde existir.
   Por isso as duas árvores convivem neste arquivo em vez de uma
   tentar servir aos dois tamanhos. */

/** Geometria do canal — o `viewBox` do SVG, em unidades próprias. */
const CANAL = { xMin: 4, xMax: 330, baseY: 34, altura: 58 } as const;
const CANAL_LARGURA = CANAL.xMax - CANAL.xMin;

/** Código do canal de cada recurso, na fatura do aparelho. */
const CANAL_CODIGO: Record<RecursoEditavel, string> = {
  pv: "BIO.CH01",
  pe: "PSI.CH02",
  mana: "ARC.CH03",
};

/**
 * O traço: uma senoide de duas frequências que anda até a fração atual
 * e desce para a linha de base. A amplitude dobra no estado crítico —
 * é a mesma leitura, mais instável.
 *
 * EM DÉFICIT (PE abaixo de zero) a fração não existe na escala: um
 * traço de comprimento zero deixava o canal vazio justamente no estado
 * em que a leitura mais importa. Lá o traço percorre a EXTENSÃO DO
 * DÉFICIT — de 0% até a marca de 50% — e AFUNDA abaixo da linha de
 * base na medida da profundidade.
 *
 * O afundamento existe porque a hachura não consegue medir isso: ela
 * mostra "quanto falta até 50%", e isso já é a faixa inteira assim que
 * o valor encosta no zero — de −1 a −6 ela ficaria idêntica. Quem diz
 * o quanto se passou do zero é a altura do traço: encostado na base no
 * zero, no fundo do canal ao chegar no piso.
 */
function tracado(
  atual: number,
  max: number,
  critico: boolean,
  deficit: boolean,
  /** 0 na superfície do déficit (valor 0), 1 no piso. */
  profundidade: number,
): { pontos: string; fimX: number; baseY: number } {
  const razao = deficit ? 0.5 : max > 0 ? Math.max(0, Math.min(1, atual / max)) : 0;
  const fimX = CANAL.xMin + CANAL_LARGURA * razao;
  const amplitude = critico ? 2.2 : 1.05;
  // O fundo útil do canal — 8 unidades acima da borda, para o traço não
  // encostar nela nem no rótulo de estado.
  const fundo = CANAL.altura - 10;
  const baseY = deficit ? CANAL.baseY + (fundo - CANAL.baseY) * profundidade : CANAL.baseY;
  const pontos: string[] = [];
  for (let x = CANAL.xMin; x <= fimX; x += 4) {
    const y = baseY + Math.sin(x * 0.19) * amplitude + Math.sin(x * 0.067) * amplitude * 0.45;
    pontos.push(`${x.toFixed(1)},${y.toFixed(2)}`);
  }
  if (razao > 0) pontos.push(`${fimX.toFixed(1)},${baseY.toFixed(2)}`);
  return { pontos: pontos.join(" "), fimX, baseY };
}

/**
 * Pulso de alteração — o `DELTA +1` que aparece no canto do canal e o
 * realce momentâneo do número. Vive aqui, e não no CSS, porque
 * depende de COMPARAR o valor novo com o anterior; `seq` sobe a cada
 * mudança para reiniciar a animação mesmo quando o delta se repete.
 */
function usePulso(valor: number): { delta: number; seq: number } | null {
  const anterior = useRef(valor);
  const seq = useRef(0);
  const [pulso, setPulso] = useState<{ delta: number; seq: number } | null>(null);
  useEffect(() => {
    const delta = valor - anterior.current;
    anterior.current = valor;
    if (delta === 0) return;
    seq.current += 1;
    setPulso({ delta, seq: seq.current });
    const t = setTimeout(() => setPulso(null), 900);
    return () => clearTimeout(t);
  }, [valor]);
  return pulso;
}

function LinhaVital({
  id,
  rotulo,
  atual,
  max,
  pendente,
  editable,
  avisa,
  onEdit,
  guard,
}: {
  id: RecursoEditavel;
  rotulo: string;
  atual: number;
  max: number;
  pendente: boolean;
  editable: boolean;
  /** Se a leitura baixa é alarme (PV/PE) ou só consumo normal (Mana). */
  avisa: boolean;
  onEdit?: (id: RecursoEditavel, value: number) => void;
  guard: (acao: () => void) => void;
}) {
  const pulso = usePulso(atual);

  /* PE abaixo de zero é DÉFICIT: não há traço para desenhar (a leitura
     saiu da escala) e o canal inteiro vira zona hachurada. O piso é
     −⌈max/2⌉, e CHEGAR nele dispara o Colapso mental (`collapse.ts`). */
  const piso = id === "pe" ? pisoPeNegativo(max) : 0;
  const deficit = id === "pe" && atual < 0;
  const razao = max > 0 ? atual / max : 0;
  const pct = Math.max(0, Math.min(100, razao * 100));
  const critico = avisa && (deficit || (max > 0 && razao <= 0.2));
  const baixo = avisa && (deficit || (max > 0 && razao < 0.5));
  /* Profundidade do déficit: 0 encostando no zero, 1 no piso. É ela
     que faz −3 e −6 lerem diferente. */
  const profundidade = deficit && piso < 0 ? Math.min(1, Math.abs(atual) / Math.abs(piso)) : 0;
  const { pontos, fimX, baseY } = tracado(atual, max, critico, deficit, profundidade);

  return (
    <div
      className="rc-vres-linha"
      data-resource={id}
      data-baixo={baixo || undefined}
      data-critico={critico || undefined}
      aria-busy={pendente || undefined}
    >
      <div className="rc-vres-rotulo">
        <div className="rc-vres-nome">{rotulo}</div>
        <div className="rc-vres-pct">{(max > 0 ? razao * 100 : 0).toFixed(1)}%</div>
      </div>

      <div
        className="rc-vres-canal"
        role="progressbar"
        aria-label={rotulo}
        aria-valuenow={atual}
        aria-valuemin={deficit ? atual : 0}
        aria-valuemax={max}
      >
        <span className="rc-vres-canal-cod" aria-hidden="true">{CANAL_CODIGO[id]}</span>
        {pulso && (
          <span className="rc-vres-delta" key={pulso.seq} aria-hidden="true">
            DELTA {pulso.delta > 0 ? `+${pulso.delta}` : pulso.delta}
          </span>
        )}

        <div className="rc-vres-limiar" aria-hidden="true" />
        {baixo && (
          <div
            className="rc-vres-deficit"
            aria-hidden="true"
            style={{ left: `${pct}%`, width: `${Math.max(0, 50 - pct)}%` }}
          />
        )}
        {baixo && (
          <span className="rc-vres-estado" aria-hidden="true">
            {deficit ? "DÉFICIT" : critico ? "CRÍTICO" : "BAIXO"}
          </span>
        )}

        <svg className="rc-vres-svg" viewBox={`0 0 334 ${CANAL.altura}`} preserveAspectRatio="none" aria-hidden="true">
          <line className="rc-vres-track" x1={CANAL.xMin} y1={CANAL.baseY} x2={CANAL.xMax} y2={CANAL.baseY} />
          {(atual > 0 || deficit) && (
            <line className="rc-vres-guia" x1={fimX} x2={fimX} y1={baseY - 13} y2={baseY + 13} />
          )}
          <polyline className="rc-vres-brilho" points={pontos} />
          <polyline className="rc-vres-traco" points={pontos} />
        </svg>
      </div>

      <div className="rc-vres-numbox">
        <div className="rc-vres-num" data-mudou={pulso ? "true" : undefined}>
          <ResourceValueCard
            atual={atual}
            max={max}
            rotulo={rotulo}
            className="rc-vres-atual"
            inputClassName="rc-vres-input"
            maxClassName="rc-vres-total"
            min={piso}
            readOnly={!editable}
            disabled={pendente}
            onGravar={(value) => onEdit?.(id, value)}
          />
        </div>

        {editable && onEdit && (
          <div className="rc-vres-ctrls">
            <button
              type="button"
              onClick={() => guard(() => onEdit(id, Math.min(max, atual + 1)))}
              disabled={pendente || atual >= max}
              aria-label={`Aumentar ${rotulo} em 1`}
            >
              +
            </button>
            <button
              type="button"
              onClick={() => guard(() => onEdit(id, Math.max(piso, atual - 1)))}
              disabled={pendente || atual <= piso}
              aria-label={`Reduzir ${rotulo} em 1`}
            >
              −
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Base visual/comportamental compartilhada por ficha, dock minimizado e
 * HUD do VTT. A variante muda somente densidade; parsing, limites,
 * botoes, teclado, animacao e semantica continuam nesta unica arvore.
 */
export function ResourceControls({
  resources,
  onEdit,
  onTogglePublic,
  readOnly = false,
  variant = "console",
}: {
  resources: ConsoleResourceValue[];
  onEdit?: (id: RecursoEditavel, value: number) => void;
  onTogglePublic?: (id: RecursoEditavel, publico: boolean) => void;
  readOnly?: boolean;
  variant?: "console" | "hud";
}) {
  const guard = useClickGuard();
  const byId = new Map(resources.map((resource) => [resource.id, resource]));

  return (
    <div className="rc-nres-card" data-variant={variant}>
      {variant === "console" && <CabecalhoModulo id="ID://VITAIS" mod="MOD.VITAL // 01" />}
      {CONSOLE_RESOURCE_DEFINITIONS.map(({ id, rotulo, corTexto, corBarra, corVazado, bgBadge, Icone, avisa }) => {
        const resource = byId.get(id);
        if (!resource) return null;
        const { atual, max, publico, pendente = false } = resource;
        const pct = max > 0 ? Math.max(0, Math.min(100, (atual / max) * 100)) : 0;
        const negativo = id === "pe" && atual < 0;
        const limiteNegativo = Math.max(1, Math.ceil(max / 2));
        const editable = !readOnly && !!onEdit;
        if (variant === "console") {
          return (
            <LinhaVital
              key={id}
              id={id}
              rotulo={rotulo}
              atual={atual}
              max={max}
              pendente={pendente}
              editable={editable}
              avisa={avisa}
              onEdit={onEdit}
              guard={guard}
            />
          );
        }
        return (
          <div
            className="rc-nres-row"
            key={id}
            data-resource={id}
            data-low={!negativo && pct <= 50 || undefined}
            data-negative={negativo || undefined}
            aria-busy={pendente || undefined}
          >
            <span className="rc-nres-badge" style={{ background: bgBadge }} aria-hidden="true">
              <Icone size={13} color={corTexto} />
            </span>
            <span className="rc-nres-nome">{rotulo}</span>
            <div
              className="rc-nres-track"
              data-negative={negativo || undefined}
              style={{ background: `rgba(${corVazado}, 0.10)` }}
              role="progressbar"
              aria-label={rotulo}
              aria-valuenow={atual}
              aria-valuemin={id === "pe" ? -limiteNegativo : 0}
              aria-valuemax={max}
            >
              {negativo ? (
                <>
                  <span className="rc-nres-negative-limit" aria-hidden="true" />
                  <span className="rc-nres-pips rc-nres-pips--negative" aria-hidden="true">
                    {Array.from({ length: limiteNegativo }, (_, index) => (
                      <span
                        className="rc-nres-pip"
                        data-filled={index < Math.abs(atual) || undefined}
                        style={{ backgroundColor: index < Math.abs(atual) ? corBarra : undefined }}
                        key={index}
                      />
                    ))}
                  </span>
                </>
              ) : (
                <span className="rc-nres-pips" aria-hidden="true">
                  {Array.from({ length: Math.max(0, max) }, (_, index) => (
                    <span
                      className="rc-nres-pip"
                      data-filled={index < atual || undefined}
                      data-end={index === atual - 1 || undefined}
                      style={{ backgroundColor: index < atual ? corBarra : undefined }}
                      key={index}
                    />
                  ))}
                </span>
              )}
            </div>
            <div className="rc-nres-adj">
              <div className="rc-nres-ctrls">
                {editable && (
                  <button
                    type="button"
                    className="rc-nres-btn"
                    onClick={() => guard(() => onEdit(id, Math.max(0, atual - 1)))}
                    disabled={pendente || atual <= 0}
                    aria-label={`Reduzir ${rotulo} em 1`}
                  >
                    <MinusIcon />
                  </button>
                )}
                <ResourceValueCard
                  atual={atual}
                  max={max}
                  rotulo={rotulo}
                  className="rc-nres-val"
                  inputClassName="rc-nres-input"
                  readOnly={!editable}
                  disabled={pendente}
                  onGravar={(value) => onEdit?.(id, value)}
                />
                {editable && (
                  <button
                    type="button"
                    className="rc-nres-btn"
                    onClick={() => guard(() => onEdit(id, Math.min(max, atual + 1)))}
                    disabled={pendente || atual >= max}
                    aria-label={`Aumentar ${rotulo} em 1`}
                  >
                    <PlusIcon />
                  </button>
                )}
              </div>
              {typeof publico === "boolean" && onTogglePublic && !readOnly && (
                <button
                  type="button"
                  className="rc-nres-eye"
                  aria-pressed={publico}
                  aria-label={publico ? `Ocultar ${rotulo} dos jogadores` : `Mostrar ${rotulo} aos jogadores`}
                  title={publico ? `Ocultar ${rotulo} dos jogadores` : `Mostrar ${rotulo} aos jogadores`}
                  disabled={pendente}
                  onClick={() => guard(() => onTogglePublic(id, !publico))}
                >
                  {publico ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Losango de Colapso — mesma geometria de PA/Reações, paleta vermelha.
 * Cores vêm do CSS (`.rc-colpip`, via `data-on`), não de atributos
 * inline: é o que deixa o hover ser uma transição de cor pura, igual
 * ao `DiamondPip` compartilhado. Um path só pelo mesmo motivo — path
 * de fill + path de stroke separados fazem o hover pintar em duas
 * origens diferentes (o bug do "efeito duplo" já visto nos atributos).
 */
function ColapsoPip({ cheio }: { cheio: boolean }) {
  return (
    <svg className="rc-colpip" data-on={cheio} viewBox="0 0 19 18" aria-hidden="true">
      <path d="M18.2725 9L9.5 17.3105L0.726562 9L9.5 0.688477L18.2725 9Z" />
    </svg>
  );
}

function SkullIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <g stroke="#FF3C50" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 6.50006C4.77614 6.50006 5 6.2762 5 6.00006C5 5.72392 4.77614 5.50006 4.5 5.50006C4.22386 5.50006 4 5.72392 4 6.00006C4 6.2762 4.22386 6.50006 4.5 6.50006Z" />
        <path d="M7.5 6.50006C7.77614 6.50006 8 6.2762 8 6.00006C8 5.72392 7.77614 5.50006 7.5 5.50006C7.22386 5.50006 7 5.72392 7 6.00006C7 6.2762 7.22386 6.50006 7.5 6.50006Z" />
        <path d="M4 10.0001V11.0001H8V10.0001" />
        <path d="M6.25 8.50006L6 8.00006L5.75 8.50006H6.25Z" />
        <path d="M8 10.0001C8.18835 9.99994 8.37283 9.94664 8.53221 9.84628C8.6916 9.74592 8.8194 9.60259 8.9009 9.43279C8.9824 9.263 9.0143 9.07363 8.99291 8.8865C8.97152 8.69937 8.89772 8.52209 8.78 8.37506C9.35299 7.82121 9.74748 7.10883 9.91289 6.32928C10.0783 5.54972 10.0071 4.73853 9.70838 3.99972C9.40968 3.26091 8.8971 2.62816 8.23638 2.18261C7.57566 1.73706 6.79691 1.49902 6 1.49902C5.20309 1.49902 4.42435 1.73706 3.76362 2.18261C3.1029 2.62816 2.59033 3.26091 2.29162 3.99972C1.99292 4.73853 1.92171 5.54972 2.08712 6.32928C2.25252 7.10883 2.64702 7.82121 3.22 8.37506C3.10228 8.52209 3.02848 8.69937 3.00709 8.8865C2.98571 9.07363 3.0176 9.263 3.0991 9.43279C3.18061 9.60259 3.30841 9.74592 3.46779 9.84628C3.62717 9.94664 3.81165 9.99994 4 10.0001" />
      </g>
    </svg>
  );
}

export function VitalsRow({ api, onEstabilizar }: { api: ConsoleApi; onEstabilizar: () => void }) {
  const { character, derivados } = api;
  const colapso = character.colapso;
  const segmentos = colapso?.segmentos ?? 0;
  const noFim = segmentos >= MAX_COLLAPSE_SEGMENTS;
  const guard = useClickGuard();

  const maximos: Record<RecursoEditavel, number> = {
    pv: derivados.pv_max,
    pe: derivados.pe_max,
    mana: derivados.mana_max,
  };

  return (
    <div className="rc-vitals rc-vitals-row">
      <div className="rc-nres-wrap">
        <ResourceControls
          resources={CONSOLE_RESOURCE_DEFINITIONS.map(({ id }) => ({
            id,
            max: maximos[id],
            atual: character.recursos_atuais?.[id] ?? maximos[id],
          }))}
          onEdit={api.editarRecurso}
        />
      </div>

      {colapso?.ativo && (
        <div className="rc-ncol-wrap">
          <div
            className="rc-ncol-card"
            aria-label={`Colapso: ${colapso.tipo === "pe" ? "mental" : "físico"}${colapso.estabilizado ? ", estável" : ""}`}
          >
          <CabecalhoModulo id="ID://COLAPSO" />
          <div className="rc-ncol-mid">
            <div className="rc-ncol-pips">
              {Array.from({ length: MAX_COLLAPSE_SEGMENTS }, (_, i) => {
                const preenchido = i < segmentos;
                return (
                  <button
                    key={i}
                    type="button"
                    className="rc-ncol-pip"
                    onClick={() => guard(api.avancarColapso)}
                    disabled={preenchido}
                    aria-label={`Colapso segmento ${i + 1} de ${MAX_COLLAPSE_SEGMENTS}${preenchido ? " (atingido)" : ""}`}
                  >
                    <ColapsoPip cheio={preenchido} />
                  </button>
                );
              })}
            </div>
            {noFim && (
              <span className="rc-ncol-morte" title={colapso?.desfecho === "morte" ? "Morte" : "Coma"}>
                <SkullIcon />
              </span>
            )}
          </div>
          <button
            type="button"
            className="rc-ncol-estabilizar"
            onClick={onEstabilizar}
            disabled={!colapso?.ativo}
            title="Estabilizar Colapso — interrompe o avanço, não cura"
            aria-label="Estabilizar Colapso"
            data-testid="console-estabilizar"
          >
            Estabilizar
          </button>
          </div>
        </div>
      )}
    </div>
  );
}
