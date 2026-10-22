"use client";

/**
 * Roleta de Traços (RUPTURA 1.2, cap. 18): 4 tipos × 8 traços. O 1d4
 * escolhe o tipo (quadrante) e o 1d8 o traço (fatia). "Girar" sorteia
 * — com os dados 3D da mesa quando há mesa — e a roda gira até a fatia
 * sorteada parar sob o ponteiro. Clicar numa fatia ou na lista faz só
 * um ajuste curto, sem as voltas. Só a fatia escolhida acende.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { COR_TIPO_TRACO, FUNDO_TIPO_TRACO } from "./iconesMarca";

export interface EscolhaTraco { tipo: number; numero: number }

const TAM = 360;
const C = TAM / 2;
const R_DENTRO = 82;
const R_FORA = 168;
const FATIA = 90 / 8;

function ponto(r: number, graus: number) {
  const t = ((graus - 90) * Math.PI) / 180;
  return [C + r * Math.cos(t), C + r * Math.sin(t)] as const;
}

function arco(a0: number, a1: number) {
  const [x0, y0] = ponto(R_FORA, a0);
  const [x1, y1] = ponto(R_FORA, a1);
  const [x2, y2] = ponto(R_DENTRO, a1);
  const [x3, y3] = ponto(R_DENTRO, a0);
  const f = (n: number) => n.toFixed(1);
  return `M${f(x0)} ${f(y0)}A${R_FORA} ${R_FORA} 0 0 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${R_DENTRO} ${R_DENTRO} 0 0 0 ${f(x3)} ${f(y3)}Z`;
}

/** Ângulo (horário, a partir do topo) do centro da fatia. */
function centro(tipo: number, numero: number) {
  return (tipo - 1) * 90 + (numero - 0.5) * FATIA;
}

const FATIAS = Array.from({ length: 32 }, (_, i) => {
  const tipo = Math.floor(i / 8) + 1;
  const numero = (i % 8) + 1;
  const a0 = (tipo - 1) * 90 + (numero - 1) * FATIA + 0.8 + (numero === 1 ? 2 : 0);
  const a1 = (tipo - 1) * 90 + numero * FATIA - 0.8 - (numero === 8 ? 2 : 0);
  const [tx, ty] = ponto(R_FORA - 15, centro(tipo, numero));
  return { tipo, numero, d: arco(a0, a1), tx, ty: ty + 3.5 };
});

const sortear = () => ({ tipo: 1 + Math.floor(Math.random() * 4), numero: 1 + Math.floor(Math.random() * 8) });

export function RodaTracos({
  valor,
  onEscolher,
  rolarDados,
  desabilitado = false,
}: {
  valor: EscolhaTraco | null;
  onEscolher: (t: EscolhaTraco) => void;
  /** Dados 3D da mesa: devolve 1d4 e 1d8 pelas faces que pararem. Sem mesa, sorteia aqui. */
  rolarDados?: () => Promise<EscolhaTraco>;
  desabilitado?: boolean;
}) {
  const [rot, setRot] = useState(() => (valor ? -centro(valor.tipo, valor.numero) : 0));
  const [dur, setDur] = useState(0);
  const [fase, setFase] = useState<"parado" | "rolando" | "girando">("parado");
  const [pulso, setPulso] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotRef = useRef(rot);
  rotRef.current = rot;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  /** Fatia que está sob o ponteiro — para seguir uma escolha feita fora da roda (a lista). */
  const sobPonteiro = useRef(valor ? `${valor.tipo}-${valor.numero}` : "");
  useEffect(() => {
    if (!valor || fase !== "parado") return;
    const chave = `${valor.tipo}-${valor.numero}`;
    if (chave === sobPonteiro.current) return;
    sobPonteiro.current = chave;
    const r = rotRef.current;
    const delta = ((((-centro(valor.tipo, valor.numero) - r) % 360) + 540) % 360) - 180;
    setDur(0.22);
    setRot(r + delta);
  }, [valor, fase]);

  function alinhar(t: EscolhaTraco, voltas: number, segundos: number) {
    if (timer.current) clearTimeout(timer.current);
    const r = rotRef.current;
    const alvo = -centro(t.tipo, t.numero);
    sobPonteiro.current = `${t.tipo}-${t.numero}`;
    const delta = voltas > 0
      ? ((((alvo - r) % 360) + 360) % 360) + 360 * voltas
      : ((((alvo - r) % 360) + 540) % 360) - 180;
    setDur(segundos);
    setRot(r + delta);
    if (voltas > 0) {
      setFase("girando");
      timer.current = setTimeout(() => { setFase("parado"); setPulso((p) => p + 1); onEscolher(t); }, segundos * 1000 + 60);
    } else {
      setFase("parado");
      onEscolher(t);
    }
  }

  async function girar() {
    if (fase !== "parado" || desabilitado) return;
    let t: EscolhaTraco;
    if (rolarDados) {
      setFase("rolando");
      try { t = await rolarDados(); } catch { t = sortear(); }
    } else {
      t = sortear();
    }
    alinhar(t, 5, 4.2);
  }

  const parado = fase === "parado";
  const pousou = parado && pulso > 0;
  const rotulo = fase === "rolando" ? "Rolando" : fase === "girando" ? "Girando" : "Girar";

  const fatias = useMemo(() => FATIAS.map((f) => {
    const ativa = parado && !!valor && valor.tipo === f.tipo && valor.numero === f.numero;
    return { ...f, ativa };
  }), [parado, valor]);

  return (
    <div className="rp-roda" data-fase={fase}>
      <svg className="rp-roda-aro" viewBox={`0 0 ${TAM} ${TAM}`} aria-hidden="true">
        <circle cx={C} cy={C} r={C - 2} fill="none" stroke="#12283a" />
        <circle cx={C} cy={C} r={C - 10} fill="none" stroke="#0a1822" strokeWidth={10} />
      </svg>
      <div
        className="rp-roda-giro"
        style={{ transform: `rotate(${rot}deg)`, transitionDuration: `${dur}s`, filter: fase === "girando" ? "blur(0.6px)" : "none" }}
      >
        <svg viewBox={`0 0 ${TAM} ${TAM}`} role="img" aria-label="Roleta de Traços: quatro tipos com oito traços cada">
          <defs>
            <filter id="rp-brilho" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={6} result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <circle cx={C} cy={C} r={C - 7} fill="none" stroke="#2a4a5c" strokeWidth={3} strokeDasharray="1 9" />
          <circle cx={C} cy={C} r={R_DENTRO + 8} fill="none" stroke="#ff8a1f" strokeOpacity={0.3} strokeDasharray="3 7" />
          {fatias.map((f) => (
            <path
              key={`${f.tipo}-${f.numero}`}
              d={f.d}
              style={{ fill: f.ativa ? COR_TIPO_TRACO[f.tipo - 1] : `color-mix(in srgb, ${COR_TIPO_TRACO[f.tipo - 1]} 18%, ${FUNDO_TIPO_TRACO[f.tipo - 1]})` }}
              stroke={f.ativa ? "#ffffff" : "#0f2230"}
              strokeWidth={1.5}
              filter={f.ativa ? "url(#rp-brilho)" : undefined}
              className={f.ativa ? "rp-fatia rp-fatia-acesa" : "rp-fatia"}
              onClick={() => { if (parado && !desabilitado) alinhar(f, 0, 0.22); }}
            />
          ))}
          {fatias.map((f) => (
            <text key={`n-${f.tipo}-${f.numero}`} x={f.tx} y={f.ty} textAnchor="middle" className="rp-fatia-num" fill={f.ativa ? "#03090f" : COR_TIPO_TRACO[f.tipo - 1]} fillOpacity={f.ativa ? 1 : 0.65}>{f.numero}</text>
          ))}
        </svg>
      </div>
      <svg className={`rp-ponteiro${fase === "girando" ? " rp-ponteiro-tique" : ""}`} width={26} height={30} viewBox="0 0 26 30" aria-hidden="true">
        <path d="M2 2h22L13 28z" fill="#ff8a1f" stroke="#ffc89a" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
      {pousou && <span key={pulso} className="rp-estouro" aria-hidden="true" />}
      <div className="rp-roda-cubo">
        <div className="rp-roda-dados">
          <span className={`rp-dado ${parado ? "rp-surge" : "rp-pisca"}`}>{parado && valor ? valor.tipo : "?"}</span>
          <span className={`rp-dado ${parado ? "rp-surge" : "rp-pisca"}`}>{parado && valor ? valor.numero : "?"}</span>
        </div>
        <button type="button" className="rp-girar" onClick={() => void girar()} disabled={!parado || desabilitado} data-testid="ruptura-girar">
          {rotulo}
        </button>
      </div>
    </div>
  );
}
