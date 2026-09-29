"use client";

/** Vitais com faixa integrada de Colapso; ações usam as mutações existentes. */

import { useEffect, useRef, useState } from "react";
import { Activity, Brain, Dices, Eye, EyeOff, HeartPulse, ShieldCheck, ShieldPlus, Skull, Zap } from "lucide-react";
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

      <div className="rc-vres-numbox" data-leitura={!(editable && onEdit) || undefined}>
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

export function VitalsRow({ api, onEditarRecurso, onEstabilizar, onTesteDecisivo }: { api: ConsoleApi; onEditarRecurso: (id: RecursoEditavel, valor: number) => void; onEstabilizar: () => void; onTesteDecisivo: () => void }) {
  const { character, derivados } = api;
  const colapso = character.colapso;
  const segmentos = Math.max(0, Math.min(MAX_COLLAPSE_SEGMENTS, colapso?.segmentos ?? 0));
  const desfecho = colapso?.desfecho;
  const encerrado = desfecho === "morte" || desfecho === "coma";
  const estabilizado = !encerrado && !!colapso?.estabilizado;
  const mental = colapso?.tipo === "pe";
  const estado = encerrado ? desfecho : estabilizado ? "estabilizado" : segmentos >= MAX_COLLAPSE_SEGMENTS ? "critico" : "ativo";
  const detalhe = encerrado
    ? desfecho === "morte" ? "Morto" : "Em coma"
    : estabilizado ? "Estabilizado · avanço suspenso"
    : segmentos >= MAX_COLLAPSE_SEGMENTS ? "Teste decisivo a cada fim de rodada"
    : mental ? "PE no limite · em curso" : "PV a zero · em curso";
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
          onEdit={onEditarRecurso}
          // Só leitura: some o −/+ e o valor deixa de ser editável.
          readOnly={api.somenteLeitura}
        />
      </div>
      {(colapso?.ativo || encerrado) && (
        <section className="rc-collapse-band" data-state={estado} data-mental={mental}
          aria-label={`Colapso ${mental ? "mental" : "físico"}`} data-testid="console-colapso">
          <div className="rc-collapse-identity">
            <span className="rc-collapse-name"><Activity aria-hidden="true" />Colapso {mental ? "mental" : "físico"}</span>
            <span className="rc-collapse-detail" role="status">{detalhe}</span>
          </div>
          <div className="rc-collapse-meter">
            <div className="rc-collapse-meter-head"><span>Segmentos</span><span>{segmentos} / {MAX_COLLAPSE_SEGMENTS}</span></div>
            <div className="rc-collapse-track">
              {Array.from({ length: MAX_COLLAPSE_SEGMENTS }, (_, i) => (
                <button key={i} type="button" className="rc-collapse-segment"
                  data-filled={i < segmentos}
                  disabled={api.somenteLeitura || i !== segmentos || estabilizado || encerrado || !colapso?.ativo}
                  onClick={() => guard(api.avancarColapso)}
                  aria-label={i < segmentos ? `Segmento ${i + 1} atingido` : `Avançar Colapso para o segmento ${i + 1}`}>
                  <span aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          {api.somenteLeitura && !encerrado && !estabilizado ? null : encerrado ? (
            <span className="rc-collapse-outcome"><Skull aria-hidden="true" />{desfecho === "morte" ? "Morto" : "Em coma"}</span>
          ) : estabilizado ? (
            <span className="rc-collapse-outcome"><ShieldCheck aria-hidden="true" />Estabilizado</span>
          ) : segmentos >= MAX_COLLAPSE_SEGMENTS ? (
            <div className="rc-collapse-actions">
              <button type="button" className="rc-collapse-resolve" onClick={onTesteDecisivo}
                title="Fazer o teste decisivo do 3º segmento"
                aria-label="Fazer teste decisivo de Colapso" data-testid="console-teste-decisivo-colapso">
                <Dices aria-hidden="true" />Fazer teste
              </button>
              <button type="button" className="rc-collapse-stabilize rc-collapse-stabilize--secondary" onClick={onEstabilizar}
                title="Estabilizar Colapso — interrompe o avanço, não cura"
                aria-label="Estabilizar Colapso" data-testid="console-estabilizar">
                <ShieldPlus aria-hidden="true" />Estabilizar
              </button>
            </div>
          ) : (
            <button type="button" className="rc-collapse-stabilize" onClick={onEstabilizar}
              title="Estabilizar Colapso — interrompe o avanço, não cura"
              aria-label="Estabilizar Colapso" data-testid="console-estabilizar">
              <ShieldPlus aria-hidden="true" />Estabilizar
            </button>
          )}
        </section>
      )}
    </div>
  );
}
