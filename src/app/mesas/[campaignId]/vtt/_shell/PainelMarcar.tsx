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
 * Linha F: a VITRINE mostra a célula como ela vai ficar no mapa (o hex
 * na cor, com o glifo do sinal) e a ficha ao lado lê nome, rótulo e
 * prazo — decide-se OLHANDO, não lendo. Duração e visibilidade, que
 * são escolhas de segunda ordem, encolhem para controles compactos na
 * mesma linha do rótulo.
 *
 * PURAMENTE APRESENTACIONAL, como as outras: recebe estado, devolve
 * intenção. Quem grava é `VttClient`.
 */

import { useState } from "react";
import { Clock, Eraser, Eye, EyeOff, Loader2, MapPin } from "lucide-react";
import { SINAIS_MARCA, type SinalMarcaUi } from "../_dominio/sinaisDeMarca";
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

/* Os quatro sinais vivem em `_dominio/sinaisDeMarca` — mapa e janela
   leem a MESMA tabela, em vez de manterem cópias que divergem. A
   reexportação mantém quem já importava daqui. */
export { SINAIS_MARCA, type SinalMarcaUi };

/**
 * Frase de ajuda de cada sinal. Fica aqui, e não na tabela do domínio,
 * porque é texto DESTA janela — o mapa não mostra descrição nenhuma.
 */
const DESC_SINAL: Record<SinalMarcaUi, string> = {
  alvo: "Aponta a prioridade da cena",
  perigo: "Avisa de uma ameaça na célula",
  rota: "Indica um caminho a seguir",
  nota: "Deixa uma informação no lugar",
};

/**
 * As durações que o servidor sabe EXPIRAR.
 *
 * O estudo oferecia "Até o fim da cena"; aqui é "Este combate", porque
 * é o que existe pra observar — as rodadas encerram, e a marcação sai.
 * Prometer "fim da cena" sem ter um evento de fim de cena seria um
 * prazo que nunca vence.
 */
export const DURACOES_MARCA = [
  { valor: "persistente", rotulo: "Persistente", desc: "Fica até alguém apagar" },
  { valor: "rodada", rotulo: "Esta rodada", desc: "Some quando a rodada vira" },
  { valor: "combate", rotulo: "Este combate", desc: "Some quando o combate termina" },
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

/* Cluster da vitrine: seis vizinhos apagados em volta da célula marcada.
   Mesma geometria do protótipo (hex de raio 22, pontudo em cima). */
const HEX_PONTOS = "0,-22 19.05,-11 19.05,11 0,22 -19.05,11 -19.05,-11";
const VIZINHOS: [number, number][] = [
  [50.95, 22], [89.05, 22], [31.9, 55], [108.1, 55], [50.95, 88], [89.05, 88],
];

export function PainelMarcar(p: PropsPainelMarcar) {
  const corAtiva = CORES_MARCA.find((c) => c.valor === p.cor) ?? CORES_MARCA[0];
  const sinalAtivo = SINAIS_MARCA.find((s) => s.valor === p.sinal) ?? SINAIS_MARCA[0];
  const duracaoAtiva = DURACOES_MARCA.find((d) => d.valor === p.duracao) ?? DURACOES_MARCA[0];
  const rotulo = p.texto.trim();

  // Descrição do que está sob o mouse/foco; `null` mostra a do sinal.
  const [foco, setFoco] = useState<string | null>(null);
  const focar = (txt: string) => ({
    onMouseEnter: () => setFoco(txt), onMouseLeave: () => setFoco(null),
    onFocus: () => setFoco(txt), onBlur: () => setFoco(null),
  });

  // "Esta rodada" só existe com combate rolando: sem rodada não há o
  // que virar, e o prazo nunca venceria. O ciclo pula a opção em vez
  // de mostrá-la morta.
  const duracaoDisponivel = (v: DuracaoMarcaUi) => v !== "rodada" || p.emCombate;
  const descDuracao = (d: (typeof DURACOES_MARCA)[number]) =>
    p.emCombate ? d.desc : `${d.desc} · “Esta rodada” só em combate`;
  const proximaDuracao = () => {
    const i = DURACOES_MARCA.findIndex((d) => d.valor === p.duracao);
    for (let passo = 1; passo <= DURACOES_MARCA.length; passo++) {
      const d = DURACOES_MARCA[(i + passo) % DURACOES_MARCA.length];
      if (duracaoDisponivel(d.valor)) return d;
    }
    return duracaoAtiva;
  };

  const descVisibilidade = p.privada
    ? (p.ehNarrador ? "Só você vê o sinal e o rótulo" : "Só você vê — nem o narrador")
    : "Jogadores veem o sinal e o rótulo";

  return (
    <JanelaFerramenta
      id="marcar"
      icone={<MapPin size={16} />}
      titulo="Marcar"
      modo={`${sinalAtivo.rotulo} · ${corAtiva.rotulo}${p.privada ? " · só pra você" : ""}`}
      modoAtributos={{ "data-sinal": p.sinal }}
      rotulo="Ferramenta Marcar"
      rotuloFechar="Fechar ferramenta Marcar"
      aoFechar={p.onFechar}
    >
      <div className="jf-corpo jmar-corpo" style={{ ["--jmar-k" as string]: corAtiva.hex }}>
        {/* VITRINE — a célula como vai ficar no mapa, e a ficha que a lê. */}
        <div className="jf-hero jmar-hero" style={{ ["--jf-hero" as string]: corAtiva.hex }}>
          <svg width="132" height="104" viewBox="0 0 140 110" fill="none" aria-hidden="true" className="jmar-arte">
            {VIZINHOS.map(([x, y], i) => (
              <polygon key={i} points={HEX_PONTOS} transform={`translate(${x} ${y})`} className="jmar-hx" />
            ))}
            <polygon
              points={HEX_PONTOS} transform="translate(70 55)"
              className="jmar-hx-on" data-privada={p.privada || undefined}
            />
            {/* O glifo é o MESMO componente que o mapa desenha
                (`GLIFO_DO_SINAL` lê a mesma tabela) — svg aninhado. */}
            <sinalAtivo.Icone x={59} y={44} width={22} height={22} strokeWidth={2} className="jmar-glifo" />
          </svg>
          <div className="jmar-ficha" aria-live="polite">
            <span className="jmar-nome">{sinalAtivo.rotulo}</span>
            <span className={`jmar-rot${rotulo ? "" : " is-vazio"}`}>
              {rotulo ? `“${rotulo}”` : "Sem rótulo"}
            </span>
            <span className="jmar-meta">
              {duracaoAtiva.rotulo} · {p.privada ? "Só você vê" : "Todos veem"}
            </span>
          </div>
        </div>

        <div className="jf-grupo">
          <span className="jf-rot" id="jmar-rot-sinal">Sinal</span>
          <div className="jf-tiles" style={{ ["--jf-n" as string]: 4 }} role="group" aria-labelledby="jmar-rot-sinal">
            {SINAIS_MARCA.map((s) => (
              <button
                key={s.valor}
                type="button" className="jf-tile jf-tile--alto jmar-sinal"
                aria-pressed={p.sinal === s.valor}
                data-testid={`marcar-sinal-${s.valor}`}
                onClick={() => p.onSinal(s.valor)}
                {...focar(DESC_SINAL[s.valor])}
              >
                <s.Icone size={20} strokeWidth={1.8} aria-hidden="true" />
                <span>{s.rotulo}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="jf-desc">{foco ?? DESC_SINAL[sinalAtivo.valor]}</p>

        <div className="jf-linha jmar-linha-cor">
          <span className="jf-l" id="jmar-rot-cor">Cor</span>
          <span className="jf-cores" role="group" aria-labelledby="jmar-rot-cor">
            {CORES_MARCA.map((c) => (
              <button
                key={c.valor}
                type="button"
                className="jf-cor"
                style={{ ["--jf-k" as string]: c.hex }}
                aria-pressed={p.cor === c.valor}
                aria-label={c.rotulo}
                title={c.rotulo}
                data-testid={`marcar-cor-${c.valor}`}
                onClick={() => p.onCor(c.valor)}
                {...focar(c.rotulo)}
              >
                <span />
              </button>
            ))}
          </span>
        </div>

        <div className="jmar-extra">
          <input
            type="text" className="jf-campo" value={p.texto} maxLength={80}
            placeholder="Rótulo (opcional)"
            aria-label="Rótulo"
            data-testid="marcar-campo-texto"
            onChange={(e) => p.onTexto(e.target.value)}
          />
          {/* Duração cicla num clique (com pips de posição) em vez de um
              `select`: são três prazos, e o nome do atual cabe no botão. */}
          <button
            type="button" className="jmar-dur"
            aria-label={`Duração: ${duracaoAtiva.rotulo}. Trocar`}
            data-testid="marcar-campo-duracao"
            data-duracao={p.duracao}
            onClick={() => {
              const d = proximaDuracao();
              p.onDuracao(d.valor);
              setFoco(descDuracao(d));
            }}
            {...focar(descDuracao(duracaoAtiva))}
          >
            <Clock size={14} aria-hidden="true" />
            <span className="jmar-dur-t">{duracaoAtiva.rotulo}</span>
            <span className="jmar-pips" aria-hidden="true">
              {DURACOES_MARCA.map((d) => (
                <i
                  key={d.valor}
                  className={`${d.valor === p.duracao ? "is-on" : ""}${duracaoDisponivel(d.valor) ? "" : " is-fora"}`}
                />
              ))}
            </span>
          </button>
          <button
            type="button" className="jmar-olho"
            aria-label="Visível para todos"
            aria-pressed={!p.privada}
            data-testid="marcar-privada"
            onClick={() => {
              p.onPrivada(!p.privada);
              setFoco(!p.privada
                ? (p.ehNarrador ? "Só você vê o sinal e o rótulo" : "Só você vê — nem o narrador")
                : "Jogadores veem o sinal e o rótulo");
            }}
            {...focar(descVisibilidade)}
          >
            {p.privada ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
          </button>
        </div>

        {/* Limpar só aparece quando há o que limpar. A contagem mora
            aqui (antes ficava também no cabeçalho, repetida). */}
        {p.naCena > 0 && (
          <div className="jmm-limpar">
            <span className="jf-leg" data-testid="marcar-contagem">
              {p.naCena} {p.naCena === 1 ? "marcação" : "marcações"} na cena
            </span>
            <button
              type="button" className="jf-quieto is-perigo"
              onClick={p.onLimpar}
              disabled={p.limpando || p.quePodeLimpar === 0}
              data-testid="marcar-limpar"
              title={p.quePodeLimpar === 0 ? "Todas as marcações são de outros participantes." : undefined}
            >
              {p.limpando ? <Loader2 size={13} className="rv-spin" aria-hidden="true" /> : <Eraser size={13} aria-hidden="true" />}
              {p.quePodeLimpar === p.naCena ? "Limpar marcações" : `Limpar as minhas (${p.quePodeLimpar})`}
            </button>
          </div>
        )}

        {/* Gestos reais de `marcarCelula`: clique cria; clique numa
            célula com marca SUA (ou qualquer, se narrador) apaga. Esc
            não fecha esta janela no código atual — quem fecha é trocar
            de ferramenta, e `V` é o atalho de Interagir. */}
        <div className="jf-atalhos">
          <span><kbd className="jf-kbd">Clique</kbd>marca</span>
          <span title={p.ehNarrador ? undefined : "Só as suas marcações"}>
            <kbd className="jf-kbd">Clique</kbd>de novo apaga
          </span>
          <span><kbd className="jf-kbd">V</kbd>fecha</span>
        </div>
      </div>
    </JanelaFerramenta>
  );
}
