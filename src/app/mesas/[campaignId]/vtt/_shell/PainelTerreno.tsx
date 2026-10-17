"use client";

/**
 * Painel da ferramenta TERRENO — ancorado ao lado da barra, NUNCA modal
 * (o mapa continua visível e recebendo gestos por baixo).
 *
 * Este componente é PURAMENTE APRESENTACIONAL: não pinta célula, não
 * fala com servidor, não conhece `hexKey` nem undo/redo. Recebe o
 * estado corrente e devolve intenções — toda a mecânica continua em
 * `VttClient.tsx` (`pintarComPincel`/`pintarComBalde`/
 * `finalizarPincelTerreno`), que é quem tem o histórico e as RPCs.
 *
 * LINHA F: vitrine com o favo do que UM clique pinta (ou a região do
 * balde), tipo em três ladrilhos com a cor que o tipo tem no mapa,
 * método, trilho de tamanho e a frase de ajuda com a instrução real.
 *
 * HIERARQUIA (o que a faixa horizontal antiga não tinha):
 *   1. TIPO   — o que vai ser pintado, com o efeito mecânico à vista.
 *   2. MÉTODO — pincel ou balde.
 *   3. TAMANHO — só quando o método é pincel (divulgação progressiva).
 *   4. CONTEXTO — instrução secundária, contagem do gesto e a ação
 *      contextual de converter o gesto em objeto, separada por borda.
 */

import { useEffect, useState } from "react";
import { JanelaFerramenta } from "./JanelaFerramenta";
import { Ban, Brush, Ellipsis, PaintBucket, Package, ShieldBan } from "lucide-react";
import { type TipoTerreno } from "../_dominio/movimento";

export type ModoPincelTerreno = "pincel" | "balde";

export interface PropsPainelTerreno {
  modoTerreno: TipoTerreno | null;
  onModoTerreno: (t: TipoTerreno | null) => void;
  modoPincel: ModoPincelTerreno;
  onModoPincel: (m: ModoPincelTerreno) => void;
  /** 0..4 → 1, 7, 19, 37 ou 61 células (raio de `hexNoRaio`). */
  raioPincel: number;
  onRaioPincel: (r: number) => void;
  /** Células alteradas no gesto em andamento; `null` quando não há gesto. */
  contagemGesto: number | null;
  /** Células do ÚLTIMO gesto concluído, disponíveis pra virar objeto. */
  celulasUltimoGesto: number;
  onConverterEmObjeto: () => void;
  onFechar: () => void;
}

const TIPOS: { valor: TipoTerreno | null; chave: string; nome: string; efeito: string; cor: string; Icone: typeof Ellipsis }[] = [
  // Cada tipo com a MESMA cor que tem no mapa (âmbar da hachura de
  // `rv-dificil-real`, vermelho de `rv-bloqueado-real`).
  { valor: "dificil", chave: "dificil", nome: "Difícil", efeito: "Cada passo custa ×2", cor: "#f5a200", Icone: Ellipsis },
  { valor: "bloqueado", chave: "bloqueado", nome: "Bloqueado", efeito: "Impede a passagem", cor: "#e0455f", Icone: ShieldBan },
  { valor: null, chave: "apagar", nome: "Apagar", efeito: "Remove o terreno pintado", cor: "#7f95b3", Icone: Ban },
];

/**
 * Números hexagonais centrados (1, 7, 19, 37, 61): cada raio a mais
 * fecha um anel INTEIRO em volta — não existe tamanho intermediário
 * que caia numa forma simétrica.
 */
const CELULAS = [1, 7, 19, 37, 61];

function dist(q: number, r: number) { return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2; }
function hexD(cx: number, cy: number, r: number) {
  const p: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    p.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${p.join("L")}Z`;
}
/** Disco REAL daquele raio, encaixado na parada do trilho. */
function discoD(k: number) {
  const r = Math.min(7, 44 / (Math.sqrt(3) * (2 * k + 1)));
  let out = "";
  for (let q = -k; q <= k; q++) for (let s = -k; s <= k; s++) {
    if (dist(q, s) <= k) out += hexD(26 + r * Math.sqrt(3) * (q + s / 2), 23 + r * 1.5 * s, r - 0.5);
  }
  return out;
}
/** Campo da vitrine: raio 4 = cabe o maior pincel inteiro. */
const CAMPO: [number, number][] = [];
for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) if (dist(q, r) <= 4) CAMPO.push([q, r]);
/**
 * Região ILUSTRATIVA do balde — o balde depende do que já está pintado
 * no mapa, então a vitrine mostra uma mancha irregular (forma de
 * "segue a região"), não uma contagem que o painel não tem como saber.
 */
const BALDE = new Set(["1,-2", "2,-2", "0,-1", "1,-1", "2,-1", "-1,0", "0,0", "1,0", "2,0", "-1,1", "0,1", "1,1", "-2,2", "-1,2", "3,-3"]);

/** Tecla modificadora por plataforma — lida depois de montar (o servidor não sabe). */
function useTeclaMod() {
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "")) setMod("⌘");
  }, []);
  return mod;
}

const celulasTxt = (n: number) => `${n} ${n === 1 ? "célula" : "células"}`;

export function PainelTerreno({
  modoTerreno, onModoTerreno,
  modoPincel, onModoPincel,
  raioPincel, onRaioPincel,
  contagemGesto, celulasUltimoGesto,
  onConverterEmObjeto, onFechar,
}: PropsPainelTerreno) {
  const mod = useTeclaMod();
  const [foco, setFoco] = useState<string | null>(null);
  const [espia, setEspia] = useState<number | null>(null);
  const tipoAtivo = TIPOS.find((t) => t.valor === modoTerreno) ?? TIPOS[0];
  const apagando = modoTerreno === null;
  const pincel = modoPincel === "pincel";
  const raio = espia ?? raioPincel;
  // Modo em uma frase — o cabeçalho responde "o que estou fazendo agora?".
  const modoTexto = `${tipoAtivo.nome} · ${pincel ? `pincel ${CELULAS[raioPincel] ?? 1}` : "balde"}`;
  const instrucao = pincel
    ? apagando
      ? `Clique ou arraste sobre o mapa pra apagar. Todo o gesto vira um único ${mod}+Z.`
      : `Clique ou arraste sobre o mapa pra pintar. Todo o gesto vira um único ${mod}+Z.`
    : apagando
      ? "Clique numa célula pra apagar toda a região contígua do mesmo tipo."
      : "Clique numa célula pra preencher toda a região contígua do mesmo tipo.";

  // Legenda da vitrine: o gesto REAL ganha de tudo (em andamento, depois
  // o último concluído); fora disso, o que um clique faria.
  const legenda = contagemGesto !== null
    ? `${celulasTxt(contagemGesto)} ${contagemGesto === 1 ? "alterada" : "alteradas"}`
    : celulasUltimoGesto > 0 && espia === null
      ? `Último gesto · ${celulasTxt(celulasUltimoGesto)}`
      : pincel ? `Um clique pinta ${celulasTxt(CELULAS[raio] ?? 1)}` : "O balde segue a região até a borda";
  const vivo = contagemGesto !== null || (celulasUltimoGesto > 0 && espia === null);
  const sobre = (txt: string) => ({
    onMouseEnter: () => setFoco(txt), onMouseLeave: () => setFoco(null),
    onFocus: () => setFoco(txt), onBlur: () => setFoco(null),
  });

  return (
    <JanelaFerramenta
      id="terreno"
      icone={<PaintBucket size={16} />}
      titulo="Terreno"
      modo={modoTexto}
      rotulo="Ferramenta Terreno"
      rotuloFechar="Fechar ferramenta Terreno"
      aoFechar={onFechar}
    >
      <div className="jf-corpo jf-terreno" style={{ ["--jf-t" as string]: tipoAtivo.cor, ["--jf-hero" as string]: tipoAtivo.cor }}>
        <div className="jf-hero jf-ter-hero">
          <svg width="168" height="140" viewBox="-74 -62 148 124" aria-hidden="true">
            {CAMPO.map(([q, r]) => {
              const pinta = pincel ? dist(q, r) <= raio : BALDE.has(`${q},${r}`);
              return (
                <path
                  key={`${q},${r}`}
                  d={hexD(8 * Math.sqrt(3) * (q + r / 2), 12 * r, 7.4)}
                  className={`jf-cel${pinta ? " is-pinta" : ""}${pinta && apagando ? " is-apaga" : ""}${q === 0 && r === 0 ? " is-centro" : ""}`}
                />
              );
            })}
          </svg>
          {/* `role="status"` — a contagem muda durante o gesto e precisa
              chegar a leitor de tela sem roubar foco do mapa. */}
          <span className={`jf-leg${vivo ? " is-vivo" : ""}`} role="status" aria-live="polite">{legenda}</span>
        </div>

        <div className="jf-tiles" style={{ ["--jf-n" as string]: 3 }} role="group" aria-label="Tipo">
          {TIPOS.map((t) => (
            <button
              key={t.chave}
              type="button"
              // `rv-fp-opcao` + `data-tipo` ficam como gancho dos roteiros
              // de verificação (`scripts/dev/check-*`).
              className="jf-tile rv-fp-opcao"
              data-tipo={t.chave}
              style={{ ["--jf-t" as string]: t.cor }}
              aria-pressed={t.valor === modoTerreno}
              onClick={() => onModoTerreno(t.valor)}
              {...sobre(t.efeito)}
            >
              <t.Icone size={16} />{t.nome}
            </button>
          ))}
        </div>

        <div className="jf-grupo">
          <span className="jf-rot" id="rv-fp-rot-metodo">Método</span>
          <div className="jf-tiles" role="group" aria-labelledby="rv-fp-rot-metodo">
            <button type="button" className="jf-tile" aria-pressed={pincel} onClick={() => onModoPincel("pincel")} {...sobre("Clique ou arraste")}>
              <Brush size={16} />Pincel
            </button>
            <button type="button" className="jf-tile" aria-pressed={!pincel} onClick={() => onModoPincel("balde")} {...sobre("Preenche a região contígua do mesmo tipo")}>
              <PaintBucket size={16} />Balde
            </button>
          </div>
        </div>

        {/* Divulgação progressiva: tamanho só existe pro pincel. */}
        {pincel && (
          <div className="jf-grupo">
            <span className="jf-rot" id="rv-fp-rot-tam">Tamanho do pincel</span>
            <div className="jf-trilho" style={{ ["--jf-n" as string]: 5 }} role="group" aria-labelledby="rv-fp-rot-tam">
              {CELULAS.map((n, k) => (
                <button
                  key={k}
                  type="button" className="jf-parada" aria-pressed={raioPincel === k}
                  aria-label={`Pincel de ${celulasTxt(n)}`}
                  onClick={() => onRaioPincel(k)}
                  onMouseEnter={() => setEspia(k)} onMouseLeave={() => setEspia(null)}
                  onFocus={() => setEspia(k)} onBlur={() => setEspia(null)}
                >
                  <svg width="52" height="46" viewBox="0 0 52 46" aria-hidden="true"><path className="jf-hx" d={discoD(k)} /></svg>
                </button>
              ))}
            </div>
            <div className="jf-trilho-leg">
              <b>{celulasTxt(CELULAS[raio] ?? 1)}</b>
              <span>{raio === 0 ? "só a célula clicada" : `raio ${raio} em volta`}</span>
            </div>
          </div>
        )}

        <p className="jf-desc">{foco ?? instrucao}</p>

        {/* Ação CONTEXTUAL do último gesto — só existe depois de pintar. */}
        {celulasUltimoGesto > 0 && (
          <div className="jf-acao jf-ter-acao">
            <button type="button" className="jf-prim" onClick={onConverterEmObjeto}>
              <Package size={15} />
              Converter {celulasTxt(celulasUltimoGesto)} em objeto
            </button>
          </div>
        )}

        <div className="jf-atalhos">
          <span><kbd className="jf-kbd">{mod}</kbd><kbd className="jf-kbd">Z</kbd>desfaz o gesto inteiro</span>
          <span><kbd className="jf-kbd">Esc</kbd>fecha</span>
        </div>
      </div>
    </JanelaFerramenta>
  );
}
