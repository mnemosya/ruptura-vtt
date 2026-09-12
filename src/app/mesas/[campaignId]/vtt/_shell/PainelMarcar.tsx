"use client";

/**
 * Ferramenta MARCAR — a janela que faltava.
 *
 * Até aqui a ferramenta ativa mostrava UMA linha de texto
 * (`.rv-submenu`: "clique numa célula pra marcar") e `marcarCelula`
 * gravava tudo fixo: `cor: "ciano"`, `privada: false`, sem rótulo. Os
 * campos já existiam no banco (`vtt_marks`) e ninguém alcançava.
 *
 * Tudo aqui GRAVA de verdade (migration 0098 acrescentou `sinal`,
 * `duracao` e `rodada_criada` a `vtt_marks`):
 *
 *   · TIPO DE SINAL é o que a marcação SIGNIFICA — alvo, perigo, rota,
 *     nota. Não confundir com `tipo`, a geometria (linha/seta/desenho/
 *     texto), que segue 'texto' porque o gesto é UM clique numa célula.
 *     Cada sinal tem glifo próprio no mapa.
 *   · DURAÇÃO expira no servidor, não na tela de cada um: "esta
 *     rodada" some quando a rodada vira, "este combate" quando as
 *     rodadas encerram.
 *
 * O que NÃO existe: botão "Posicionar". No estudo ele é o passo final
 * de um fluxo configurar→posicionar; aqui a ferramenta já está armada
 * enquanto está ativa, e clicar na célula marca. Um botão que não muda
 * nada ensinaria que o produto tem controle morto.
 *
 * PURAMENTE APRESENTACIONAL, como as outras: recebe estado, devolve
 * intenção. Quem grava é `VttClient`.
 */

import { Crosshair, Eraser, FileText, Loader2, MapPin, MousePointerClick, Navigation, TriangleAlert, Users } from "lucide-react";
import { JanelaFerramenta } from "./JanelaFerramenta";

/** As seis cores que `vtt_marks.cor` aceita — nem uma a mais. */
export const CORES_MARCA = [
  { valor: "ciano", rotulo: "Ciano", hex: "#00d4ff" },
  { valor: "ambar", rotulo: "Âmbar", hex: "#f5a200" },
  { valor: "verde", rotulo: "Verde", hex: "#22d3aa" },
  { valor: "vermelho", rotulo: "Vermelho", hex: "#ff5f74" },
  { valor: "roxo", rotulo: "Roxo", hex: "#8b5cf6" },
  { valor: "branco", rotulo: "Branco", hex: "#eafcff" },
] as const;

export type CorMarcaUi = (typeof CORES_MARCA)[number]["valor"];

/** Os quatro sinais que `vtt_marks.sinal` aceita. Ícones do PRODUTO. */
export const SINAIS_MARCA = [
  { valor: "alvo", rotulo: "Alvo", sub: "prioridade", Icone: Crosshair },
  { valor: "perigo", rotulo: "Perigo", sub: "ameaça", Icone: TriangleAlert },
  { valor: "rota", rotulo: "Rota", sub: "deslocam.", Icone: Navigation },
  { valor: "nota", rotulo: "Nota", sub: "informação", Icone: FileText },
] as const;

export type SinalMarcaUi = (typeof SINAIS_MARCA)[number]["valor"];

/**
 * As durações que o servidor sabe EXPIRAR.
 *
 * O estudo oferecia "Até o fim da cena"; aqui é "Este combate", porque
 * é o que existe pra observar — as rodadas encerram, e a marcação sai.
 * Prometer "fim da cena" sem ter um evento de fim de cena seria um
 * prazo que nunca vence.
 */
export const DURACOES_MARCA = [
  { valor: "persistente", rotulo: "Persistente" },
  { valor: "rodada", rotulo: "Esta rodada" },
  { valor: "combate", rotulo: "Este combate" },
] as const;

export type DuracaoMarcaUi = (typeof DURACOES_MARCA)[number]["valor"];

export interface PropsPainelMarcar {
  sinal: SinalMarcaUi;
  onSinal: (s: SinalMarcaUi) => void;
  duracao: DuracaoMarcaUi;
  onDuracao: (d: DuracaoMarcaUi) => void;
  /** `false` fora de combate — "esta rodada" não tem o que contar. */
  emCombate: boolean;
  cor: CorMarcaUi;
  onCor: (c: CorMarcaUi) => void;
  texto: string;
  onTexto: (t: string) => void;
  privada: boolean;
  onPrivada: (v: boolean) => void;
  /** Marcações na cena e quantas o usuário corrente pode apagar. */
  naCena: number;
  quePodeLimpar: number;
  limpando: boolean;
  onLimpar: () => void;
  onFechar: () => void;
  ehNarrador: boolean;
}

export function PainelMarcar(p: PropsPainelMarcar) {
  const corAtiva = CORES_MARCA.find((c) => c.valor === p.cor) ?? CORES_MARCA[0];
  const sinalAtivo = SINAIS_MARCA.find((s) => s.valor === p.sinal) ?? SINAIS_MARCA[0];

  return (
    <JanelaFerramenta
      id="marcar"
      indice="03"
      icone={<MapPin size={16} />}
      titulo="Marcar"
      modo={`${sinalAtivo.rotulo} · ${corAtiva.rotulo}${p.privada ? " · só pra você" : ""}`}
      modoAtributos={{ "data-sinal": p.sinal }}
      acoesCabecalho={
        p.naCena > 0
          ? <span className="rv-fp-meta" data-testid="marcar-contagem">{p.naCena} na cena</span>
          : undefined
      }
      rotulo="Ferramenta Marcar"
      rotuloFechar="Fechar ferramenta Marcar"
      className="rv-fp--marcar"
      aoFechar={p.onFechar}
    >
      <div className="rv-fp-corpo">
        <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo" id="rv-fp-rot-sinal">Tipo de sinal</span>
          <div className="rv-fp-seg rv-fp-seg--4" role="group" aria-labelledby="rv-fp-rot-sinal">
            {SINAIS_MARCA.map((s) => (
              <button
                key={s.valor}
                type="button" className="rv-fp-seg-btn"
                style={{ ["--jf-acento" as string]: corAtiva.hex }}
                aria-pressed={p.sinal === s.valor}
                data-testid={`marcar-sinal-${s.valor}`}
                onClick={() => p.onSinal(s.valor)}
              >
                <s.Icone size={19} />
                <span className="rv-fp-seg-nome">{s.rotulo}</span>
                <span className="rv-fp-seg-sub">{s.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Prévia — a mesma peça do estudo: o losango com o ícone na
            cor escolhida, pra decidir a cor OLHANDO, não lendo. */}
        <div
          className="rv-fp-previa"
          data-privada={p.privada || undefined}
          style={{ ["--marca" as string]: corAtiva.hex }}
        >
          <span className="rv-fp-previa-marca">
            <sinalAtivo.Icone size={18} />
          </span>
          <span className="rv-fp-previa-txt">
            <span className="rv-fp-previa-nome">Pré-visualização</span>
            <span className="rv-fp-previa-sub">
              {p.texto.trim()
                ? `“${p.texto.trim()}” sobre a célula escolhida.`
                : "Silhueta que aparecerá sobre a célula escolhida."}
            </span>
          </span>
        </div>

        <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo" id="rv-fp-rot-cor-marca">Cor</span>
          <div className="rv-fp-cores" role="group" aria-labelledby="rv-fp-rot-cor-marca">
            {CORES_MARCA.map((c) => (
              <button
                key={c.valor}
                type="button"
                className="rv-fp-cor"
                style={{ ["--marca" as string]: c.hex }}
                aria-pressed={p.cor === c.valor}
                aria-label={c.rotulo}
                title={c.rotulo}
                data-testid={`marcar-cor-${c.valor}`}
                onClick={() => p.onCor(c.valor)}
              />
            ))}
          </div>
        </div>

        <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo">Rótulo &amp; duração</span>
          <div className="rv-fp-campos-lado">
            <label className="rv-fp-campo">
              <span>Rótulo opcional</span>
              <input
                type="text" value={p.texto} maxLength={80}
                placeholder="Ex.: rota de fuga"
                data-testid="marcar-campo-texto"
                onChange={(e) => p.onTexto(e.target.value)}
              />
            </label>
            <label className="rv-fp-campo">
              <span>Duração</span>
              <select
                value={p.duracao}
                data-testid="marcar-campo-duracao"
                onChange={(e) => p.onDuracao(e.target.value as DuracaoMarcaUi)}
              >
                {DURACOES_MARCA.map((d) => (
                  // "Esta rodada" só existe com combate rolando: sem
                  // rodada não há o que virar, e o prazo nunca venceria.
                  <option key={d.valor} value={d.valor} disabled={d.valor === "rodada" && !p.emCombate}>
                    {d.rotulo}{d.valor === "rodada" && !p.emCombate ? " — sem combate" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <label className="rv-fp-check" data-testid="marcar-privada">
          <input type="checkbox" checked={!p.privada} onChange={(e) => p.onPrivada(!e.target.checked)} />
          <span className="rv-fp-check-txt">
            <span className="rv-fp-check-nome">Visível para todos</span>
            <span className="rv-fp-check-sub">
              {p.privada
                ? (p.ehNarrador ? "só você vê o sinal e o rótulo" : "nem o narrador vê esta marcação")
                : "jogadores veem o sinal e o rótulo"}
            </span>
          </span>
          <Users size={14} className="rv-fp-check-ic" />
        </label>

        <p className="rv-fp-instrucao">
          <MousePointerClick size={13} />
          <span>Clique numa célula pra marcar. Clique de novo na sua marcação pra apagar.</span>
        </p>
      </div>

      {p.naCena > 0 && (
        <div className="rv-fp-rodape">
          <span className="rv-fp-rotulo">
            {p.naCena} {p.naCena === 1 ? "marcação" : "marcações"} na cena
          </span>
          <button
            type="button" className="rv-btn rv-fp-primaria"
            onClick={p.onLimpar}
            disabled={p.limpando || p.quePodeLimpar === 0}
            data-testid="marcar-limpar"
            title={p.quePodeLimpar === 0 ? "Todas as marcações são de outros participantes." : undefined}
          >
            {p.limpando ? <Loader2 size={14} className="rv-spin" /> : <Eraser size={14} />}
            {p.quePodeLimpar === p.naCena ? "Limpar marcações" : `Limpar as minhas (${p.quePodeLimpar})`}
          </button>
        </div>
      )}
    </JanelaFerramenta>
  );
}
