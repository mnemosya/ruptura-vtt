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
 * HIERARQUIA (o que a faixa horizontal antiga não tinha):
 *   1. TIPO   — o que vai ser pintado, com o efeito mecânico à vista.
 *   2. MÉTODO — pincel ou balde.
 *   3. TAMANHO — só quando o método é pincel (divulgação progressiva).
 *   4. CONTEXTO — instrução secundária, contagem do gesto e a ação
 *      contextual de converter o gesto em objeto, separada por borda.
 */

import { JanelaFerramenta } from "./JanelaFerramenta";
import { Ban, Brush, Check, Ellipsis, MousePointerClick, PaintBucket, Package, ShieldBan } from "lucide-react";
import { type TipoTerreno } from "../_dominio/movimento";

export type ModoPincelTerreno = "pincel" | "balde";

export interface PropsPainelTerreno {
  modoTerreno: TipoTerreno | null;
  onModoTerreno: (t: TipoTerreno | null) => void;
  modoPincel: ModoPincelTerreno;
  onModoPincel: (m: ModoPincelTerreno) => void;
  /** 0 | 1 | 2 → 1, 7 ou 19 células (raio de `hexNoRaio`). */
  raioPincel: number;
  onRaioPincel: (r: number) => void;
  /** Células alteradas no gesto em andamento; `null` quando não há gesto. */
  contagemGesto: number | null;
  /** Células do ÚLTIMO gesto concluído, disponíveis pra virar objeto. */
  celulasUltimoGesto: number;
  onConverterEmObjeto: () => void;
  onFechar: () => void;
}

/**
 * Favo do tamanho do pincel — desenha o disco REAL daquele raio
 * (1/7/19/37/61 células), não um ícone genérico.
 *
 * O disco sempre PREENCHE o ícone: o passo entre células é calculado
 * pra caber na caixa, então raios maiores viram um favo mais fino em
 * vez de um desenho que estoura a caixa. A magnitude quem carrega é o
 * número ao lado ("37 células"); o favo carrega a FORMA.
 */
function Favo({ raio }: { raio: number }) {
  const CAIXA = 22;
  const centro = CAIXA / 2;
  // Largura do disco = (2·raio+1) colunas; altura = 2 + 3·raio "meios".
  const passo = Math.min(
    (CAIXA - 2) / (Math.sqrt(3) * (2 * raio + 1)),
    (CAIXA - 2) / (2 + 3 * raio),
  );
  const celulas: { x: number; y: number }[] = [];
  for (let dq = -raio; dq <= raio; dq++) {
    for (let dr = -raio; dr <= raio; dr++) {
      const ds = -dq - dr;
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds)) > raio) continue;
      celulas.push({
        x: centro + passo * Math.sqrt(3) * (dq + dr / 2),
        y: centro + passo * 1.5 * dr,
      });
    }
  }
  const r = passo * 0.92;
  return (
    <svg className="rv-fp-favo" width="22" height="22" viewBox={`0 0 ${CAIXA} ${CAIXA}`} aria-hidden="true">
      {celulas.map((c, i) => {
        const pts = Array.from({ length: 6 }, (_, k) => {
          const ang = (Math.PI / 180) * (60 * k - 30);
          return `${(c.x + r * Math.cos(ang)).toFixed(2)},${(c.y + r * Math.sin(ang)).toFixed(2)}`;
        }).join(" ");
        return <polygon key={i} points={pts} className="on" />;
      })}
    </svg>
  );
}

const TIPOS: {
  valor: TipoTerreno | null;
  nome: string;
  efeito: string;
  Icone: typeof Ellipsis;
  modificador?: string;
}[] = [
  { valor: "dificil", nome: "Difícil", efeito: "Cada passo custa ×2", Icone: Ellipsis },
  { valor: "bloqueado", nome: "Bloqueado", efeito: "Impede a passagem", Icone: ShieldBan },
  { valor: null, nome: "Apagar", efeito: "Remove o terreno pintado", Icone: Ban, modificador: "rv-fp-opcao--apagar" },
];

/**
 * Tamanhos do pincel — números hexagonais centrados (1, 7, 19, 37,
 * 61): cada raio a mais fecha um anel INTEIRO em volta, então não
 * existe tamanho intermediário que caia numa forma simétrica.
 */
const TAMANHOS: { raio: number; nome: string; sub: string }[] = [
  { raio: 0, nome: "1", sub: "célula" },
  { raio: 1, nome: "7", sub: "células" },
  { raio: 2, nome: "19", sub: "células" },
  { raio: 3, nome: "37", sub: "células" },
  { raio: 4, nome: "61", sub: "células" },
];

export function PainelTerreno({
  modoTerreno, onModoTerreno,
  modoPincel, onModoPincel,
  raioPincel, onRaioPincel,
  contagemGesto, celulasUltimoGesto,
  onConverterEmObjeto, onFechar,
}: PropsPainelTerreno) {
  const tipoAtivo = TIPOS.find((t) => t.valor === modoTerreno) ?? TIPOS[0];
  const apagando = modoTerreno === null;
  // Modo em uma frase — o cabeçalho responde "o que estou fazendo agora?"
  // sem obrigar a reler os três grupos de controle abaixo.
  const modoTexto = apagando
    ? modoPincel === "balde" ? "Apagar · balde" : `Apagar · pincel ${TAMANHOS[raioPincel]?.nome ?? "1"}`
    : modoPincel === "balde"
      ? `${tipoAtivo.nome} · balde`
      : `${tipoAtivo.nome} · pincel ${TAMANHOS[raioPincel]?.nome ?? "1"}`;

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

      <div className="rv-fp-corpo">
        <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo" id="rv-fp-rot-tipo">Tipo</span>
          <div className="rv-fp-opcoes" role="group" aria-labelledby="rv-fp-rot-tipo">
            {TIPOS.map((t) => {
              const ativo = t.valor === modoTerreno;
              return (
                <button
                  key={t.nome}
                  type="button"
                  className={`rv-fp-opcao${t.modificador ? ` ${t.modificador}` : ""}`}
                  aria-pressed={ativo}
                  onClick={() => onModoTerreno(t.valor)}
                >
                  <span className="rv-fp-opcao-ic"><t.Icone size={16} /></span>
                  <span className="rv-fp-opcao-txt">
                    <span className="rv-fp-opcao-nome">{t.nome}</span>
                    <span className="rv-fp-opcao-efeito">{t.efeito}</span>
                  </span>
                  <span className="rv-fp-opcao-marca"><Check size={14} /></span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo" id="rv-fp-rot-metodo">Método</span>
          <div className="rv-fp-seg" role="group" aria-labelledby="rv-fp-rot-metodo">
            <button
              type="button" className="rv-fp-seg-btn" aria-pressed={modoPincel === "pincel"}
              onClick={() => onModoPincel("pincel")}
            >
              <Brush size={15} />
              <span className="rv-fp-seg-nome">Pincel</span>
              <span className="rv-fp-seg-sub">clique ou arraste</span>
            </button>
            <button
              type="button" className="rv-fp-seg-btn" aria-pressed={modoPincel === "balde"}
              onClick={() => onModoPincel("balde")}
            >
              <PaintBucket size={15} />
              <span className="rv-fp-seg-nome">Balde</span>
              <span className="rv-fp-seg-sub">região contígua</span>
            </button>
          </div>
        </div>

        {/* Divulgação progressiva: tamanho só existe pro pincel. */}
        {modoPincel === "pincel" && (
          <div className="rv-fp-grupo">
            <span className="rv-fp-rotulo" id="rv-fp-rot-tam">Tamanho do pincel</span>
            <div className="rv-fp-tamanhos" role="group" aria-labelledby="rv-fp-rot-tam">
              {TAMANHOS.map((t) => (
                <button
                  key={t.raio}
                  type="button" className="rv-fp-seg-btn" aria-pressed={raioPincel === t.raio}
                  aria-label={`Pincel de ${t.nome} ${t.sub}`}
                  onClick={() => onRaioPincel(t.raio)}
                >
                  <Favo raio={t.raio} />
                  <span className="rv-fp-seg-nome">{t.nome}</span>
                  <span className="rv-fp-seg-sub">{t.sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="rv-fp-instrucao">
          <MousePointerClick size={13} />
          <span>
            {modoPincel === "balde"
              ? apagando
                ? "Clique numa célula pra apagar toda a região contígua do mesmo tipo."
                : "Clique numa célula pra preencher toda a região contígua do mesmo tipo."
              : apagando
                ? "Clique ou arraste sobre o mapa pra apagar. Todo o gesto vira um único Ctrl+Z."
                : "Clique ou arraste sobre o mapa pra pintar. Todo o gesto vira um único Ctrl+Z."}
          </span>
        </p>

        {/* `role="status"` — a contagem muda durante o gesto e precisa
            chegar a leitor de tela sem roubar foco do mapa. */}
        <p
          className={`rv-fp-status${contagemGesto === null ? " rv-fp-status--neutro" : ""}`}
          role="status" aria-live="polite"
        >
          {contagemGesto !== null
            ? <><strong>{contagemGesto}</strong>&nbsp;célula{contagemGesto === 1 ? "" : "s"} alterada{contagemGesto === 1 ? "" : "s"}</>
            : "Nenhum gesto em andamento"}
        </p>

      </div>

      {/* Ação CONTEXTUAL do último gesto — no rodapé fixo, separada dos
          controles de modo: ela não é "mais um botão de configuração",
          é uma oferta pontual que aparece depois de pintar. */}
      {celulasUltimoGesto > 0 && (
        <div className="rv-fp-rodape">
          <span className="rv-fp-rotulo">Último gesto</span>
          <button type="button" className="rv-btn rv-fp-primaria" onClick={onConverterEmObjeto}>
            <Package size={14} />
            Converter {celulasUltimoGesto} célula{celulasUltimoGesto === 1 ? "" : "s"} em objeto
          </button>
        </div>
      )}
    </JanelaFerramenta>
  );
}
