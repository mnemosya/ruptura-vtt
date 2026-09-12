"use client";

/**
 * Botões CONTEXTUAIS de confirmar/descartar uma área recém-criada —
 * flutuam ao lado da própria geometria, no mapa, e não no meio da
 * janela lateral. O caminho principal de decisão fica onde o olho do
 * usuário já está: na forma que ele acabou de desenhar.
 *
 * POSICIONAMENTO: recebe uma âncora em coordenadas do MUNDO e a
 * converte pra coordenadas de TELA no momento de desenhar. Por isso
 * acompanha pan e zoom naturalmente, e por isso o tamanho dos botões
 * NÃO escala com o zoom (são HTML, fora do `<svg>` — em qualquer nível
 * de zoom continuam do mesmo tamanho e legíveis).
 *
 * O grupo se afasta da âncora e inverte de lado perto das bordas, pra
 * nunca sair da área ÚTIL nem cobrir a alça principal da área.
 *
 * "Área útil" e não "viewport": a barra de ferramentas ocupa a faixa
 * esquerda e o painel de sessão a direita, os dois POR CIMA do mapa.
 * Encostar o grupo na borda do viewport punha os botões embaixo deles —
 * visíveis, e impossíveis de clicar. O limite é o retângulo do palco
 * menos o que está por cima dele.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";

export interface PropsAcoesAreaFlutuantes {
  /** Posição de TELA da âncora (já convertida pelo mapa). `null` esconde o grupo. */
  ancoraTela: { x: number; y: number } | null;
  onManter: () => void;
  onDescartar: () => void;
  /** RPC em voo: mostra progresso e IMPEDE duplo envio (os dois botões ficam inertes). */
  persistindo: boolean;
  /** Mensagem de erro da última tentativa — a área NÃO é perdida, dá pra tentar de novo. */
  erro: string | null;
  /** Editando uma área JÁ persistida (não criando uma nova) — troca os rótulos pra "Salvar"/"Cancelar", mesma posição e mesmo par de botões. */
  editando?: boolean;
  /** Régua da dimensão atual (`reguaDosParametros`) — mesma medida que aparece durante o arrasto de criação, agora também visível editando. */
  medida?: string | null;
}

/** Deslocamento do grupo em relação à âncora, pra não cobrir a borda da forma nem a alça. */
const DESLOC_X = 14;
const DESLOC_Y = -14;
/** Espaço estimado do grupo — usado só pra decidir de que lado ele cabe. */
const LARGURA_ESTIMADA = 158;
const ALTURA_ESTIMADA = 36;
/** A régua de medida quebra linha própria (`flex-basis: 100%`) — soma essa altura extra à estimativa quando ela está presente, senão o grupo cresce pra dentro da trilha/HUD sem que o flip perceba. */
const ALTURA_EXTRA_MEDIDA = 16;
const MARGEM = 10;

/**
 * Mantém o grupo dentro do viewport: inverte pro outro lado do
 * ponteiro quando não cabe à direita/abaixo, e no limite gruda na
 * margem. Função pura e exportada — testável sem DOM.
 */
export interface AreaUtil {
  esquerda: number;
  topo: number;
  direita: number;
  base: number;
}

export function posicaoDasAcoes(
  ancora: { x: number; y: number },
  area: AreaUtil,
  comMedida = false,
): { left: number; top: number } {
  const alturaEstimada = ALTURA_ESTIMADA + (comMedida ? ALTURA_EXTRA_MEDIDA : 0);
  let left = ancora.x + DESLOC_X;
  let top = ancora.y + DESLOC_Y;
  if (left + LARGURA_ESTIMADA > area.direita - MARGEM) left = ancora.x - LARGURA_ESTIMADA - DESLOC_X;
  if (top + alturaEstimada > area.base - MARGEM) top = ancora.y - alturaEstimada - DESLOC_X;
  const limiteEsq = area.esquerda + MARGEM;
  const limiteTopo = area.topo + MARGEM;
  return {
    left: Math.min(Math.max(left, limiteEsq), Math.max(limiteEsq, area.direita - LARGURA_ESTIMADA - MARGEM)),
    top: Math.min(Math.max(top, limiteTopo), Math.max(limiteTopo, area.base - alturaEstimada - MARGEM)),
  };
}

/**
 * O retângulo de tela onde um controle flutuante é de fato clicável:
 * o palco menos a barra de ferramentas e o painel de sessão, que ficam
 * POR CIMA dele. Cai no viewport inteiro se algum deles não existir
 * (nenhum é obrigatório).
 */
export function areaUtilDoMapa(): AreaUtil {
  const area: AreaUtil = { esquerda: 0, topo: 0, direita: window.innerWidth, base: window.innerHeight };
  const palco = document.querySelector(".rv-palco")?.getBoundingClientRect();
  if (palco) {
    area.esquerda = palco.left; area.topo = palco.top;
    area.direita = palco.right; area.base = palco.bottom;
  }
  const barra = document.querySelector(".rv-ferramentas")?.getBoundingClientRect();
  if (barra && barra.right > area.esquerda) area.esquerda = barra.right;
  const painel = document.querySelector(".rv-painel")?.getBoundingClientRect();
  if (painel && painel.left < area.direita) area.direita = painel.left;
  return area;
}

export function AcoesAreaFlutuantes({ ancoraTela, onManter, onDescartar, persistindo, erro, editando, medida }: PropsAcoesAreaFlutuantes) {
  if (!ancoraTela) return null;
  const pos = posicaoDasAcoes(ancoraTela, areaUtilDoMapa(), !!medida);
  const rotuloConfirmar = editando ? "Salvar" : "Manter";

  return (
    <div
      className="rv-area-acoes-flutuantes"
      data-testid="area-acoes-flutuantes"
      style={{ left: pos.left, top: pos.top }}
      role="group"
      aria-label={editando ? "Salvar ou cancelar a edição da área" : "Confirmar ou descartar a área criada"}
      // O clique aqui NUNCA pode atravessar pro mapa e começar outra área.
      onPointerDown={(e) => e.stopPropagation()}
    >
      {medida && <span className="rv-area-acoes-medida" data-testid="area-acoes-medida">{medida}</span>}
      <button
        type="button"
        className="rv-area-acao-flutuante rv-area-acao-flutuante--confirmar"
        data-testid="area-flutuante-manter"
        aria-label={editando ? "Salvar alterações" : "Manter área na mesa"}
        disabled={persistindo}
        onClick={onManter}
      >
        {persistindo ? <Loader2 size={15} className="rv-spin" /> : <Check size={15} />}
        <span className="rv-area-acao-rotulo">{persistindo ? "Salvando…" : rotuloConfirmar}</span>
      </button>
      <button
        type="button"
        className="rv-area-acao-flutuante rv-area-acao-flutuante--descartar"
        data-testid="area-flutuante-descartar"
        aria-label={editando ? "Cancelar edição" : "Descartar área"}
        disabled={persistindo}
        onClick={onDescartar}
      >
        <X size={15} />
        <span className="rv-area-acao-rotulo">{editando ? "Cancelar" : "Descartar"}</span>
      </button>
      {erro && <p className="rv-area-acao-erro" role="alert" data-testid="area-flutuante-erro">{erro}</p>}
    </div>
  );
}

/** Retângulo de um obstáculo real (Salvar/Cancelar, sidebar, janela de Áreas, menus…). */
export interface RetanguloObstaculo {
  left: number; top: number; right: number; bottom: number;
  /** Barras de decisão (Manter/Descartar, Salvar/Cancelar) — o único obstáculo que o fallback ainda tenta evitar quando nenhuma posição fica 100% livre. */
  prioridade?: boolean;
}

const TAMANHO_BOTAO_RAPIDO = { largura: 30, altura: 30 };
const VAO_BOTAO_RAPIDO = 10;

function retangulosSeSobrepoem(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Posição do lápis de edição rápida: nunca só "âncora + deslocamento
 * fixo" — testa candidatos ao redor da âncora (cardeais primeiro, por
 * serem os mais próximos, diagonais como reforço) e rejeita qualquer
 * um que caia fora do viewport ou sobre um obstáculo real. `z-index`
 * sozinho não resolve isto: dois elementos no mesmo plano visual
 * continuam colidindo visualmente mesmo com prioridades de pintura
 * diferentes — a única solução de verdade é NUNCA ocupar o mesmo
 * espaço. Função pura, testável sem DOM.
 */
export function resolverPosicaoEdicaoRapida(
  ancora: { x: number; y: number },
  viewport: { largura: number; altura: number },
  obstaculos: readonly RetanguloObstaculo[],
  tamanho = TAMANHO_BOTAO_RAPIDO,
): { left: number; top: number } {
  const { largura: w, altura: h } = tamanho;
  const g = VAO_BOTAO_RAPIDO;
  const MARGEM = 6;
  // Ordem = distância crescente até a âncora: cardeais colam na âncora,
  // diagonais só entram se nenhum cardeal servir.
  const candidatos = [
    { left: ancora.x + g, top: ancora.y - h / 2 }, // direita
    { left: ancora.x - g - w, top: ancora.y - h / 2 }, // esquerda
    { left: ancora.x - w / 2, top: ancora.y - g - h }, // acima
    { left: ancora.x - w / 2, top: ancora.y + g }, // abaixo
    { left: ancora.x + g, top: ancora.y - g - h }, // diagonal superior-direita
    { left: ancora.x - g - w, top: ancora.y - g - h }, // diagonal superior-esquerda
    { left: ancora.x + g, top: ancora.y + g }, // diagonal inferior-direita
    { left: ancora.x - g - w, top: ancora.y + g }, // diagonal inferior-esquerda
  ];

  const dentroDoViewport = (c: { left: number; top: number }) => (
    c.left >= MARGEM && c.top >= MARGEM
    && c.left + w <= viewport.largura - MARGEM && c.top + h <= viewport.altura - MARGEM
  );
  const semColisao = (c: { left: number; top: number }, obstaculosParaTestar: readonly RetanguloObstaculo[]) => {
    const box = { left: c.left, top: c.top, right: c.left + w, bottom: c.top + h };
    return !obstaculosParaTestar.some((o) => retangulosSeSobrepoem(box, o));
  };

  // 1ª tentativa: livre de QUALQUER obstáculo, dentro do viewport.
  const livre = candidatos.find((c) => dentroDoViewport(c) && semColisao(c, obstaculos));
  if (livre) return livre;

  // 2ª tentativa: nenhuma posição ficou 100% livre — prioriza nunca
  // cobrir as barras de decisão (Manter/Descartar, Salvar/Cancelar),
  // aceitando esbarrar em algo menos crítico (sidebar, menu) se preciso.
  const prioritarios = obstaculos.filter((o) => o.prioridade);
  const semBarraDeDecisao = candidatos.find((c) => dentroDoViewport(c) && semColisao(c, prioritarios));
  if (semBarraDeDecisao) return semBarraDeDecisao;

  // Último recurso: nenhuma posição escapa de tudo — fica na mais
  // próxima da âncora, só grudada nas bordas do viewport.
  const c0 = candidatos[0];
  return {
    left: Math.min(Math.max(c0.left, MARGEM), Math.max(MARGEM, viewport.largura - w - MARGEM)),
    top: Math.min(Math.max(c0.top, MARGEM), Math.max(MARGEM, viewport.altura - h - MARGEM)),
  };
}

/** Seletores dos elementos reais que o lápis nunca pode cobrir — lidos ao vivo do DOM a cada reposicionamento. Os OUTROS botões de edição rápida entram à parte (ver `resolverPosicoesEdicaoRapidas`): cada um é obstáculo dos demais, nunca de si mesmo. */
const SELETORES_OBSTACULO_PRIORITARIO = [".rv-area-acoes-flutuantes"];
const SELETORES_OBSTACULO_SECUNDARIO = [".rv-painel", ".rv-flutuante", ".rv-rodadas", ".rv-faccao", ".rv-ferramentas"];

function coletarObstaculosDoAmbiente(): RetanguloObstaculo[] {
  const obstaculos: RetanguloObstaculo[] = [];
  for (const seletor of SELETORES_OBSTACULO_PRIORITARIO) {
    for (const el of document.querySelectorAll(seletor)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) obstaculos.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, prioridade: true });
    }
  }
  for (const seletor of SELETORES_OBSTACULO_SECUNDARIO) {
    for (const el of document.querySelectorAll(seletor)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) obstaculos.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
  }
  return obstaculos;
}

function retanguloDoPos(pos: { left: number; top: number }, tamanho = TAMANHO_BOTAO_RAPIDO): RetanguloObstaculo {
  return { left: pos.left, top: pos.top, right: pos.left + tamanho.largura, bottom: pos.top + tamanho.altura };
}

/**
 * Posiciona VÁRIOS lápis de edição rápida ao mesmo tempo (um por área
 * candidata — seleção e hover são independentes, cada uma com o seu),
 * garantindo que eles nunca fiquem um em cima do outro: processa numa
 * ORDEM FIXA (`ordemPrioridade`, ex. selecionada antes de hover; empate
 * decidido por id) e cada botão já colocado vira obstáculo dos
 * seguintes NESTE MESMO PASSE. Isso evita o efeito gangorra de dois
 * resolvedores independentes reagindo em círculo um ao outro — a ordem
 * é sempre a mesma pros mesmos ids, então o resultado nunca alterna
 * sozinho com o ponteiro parado. Função pura, testável sem DOM.
 */
export function resolverPosicoesEdicaoRapidas(
  ancoras: readonly { id: string; ponto: { x: number; y: number } }[],
  viewport: { largura: number; altura: number },
  obstaculosDoAmbiente: readonly RetanguloObstaculo[],
  ordemPrioridade: readonly string[] = [],
  /**
   * Posições já ESTABELECIDAS que devem ser preservadas exatamente —
   * quem chama decide quais (ver `usePosicoesEdicaoRapida`: mantém a de
   * todo id cuja âncora não mudou). Entram como obstáculo dos demais
   * ANTES de qualquer colocação nova, então um lápis que acabou de
   * aparecer nunca empurra um que já estava na tela.
   */
  posicoesFixas: ReadonlyMap<string, { left: number; top: number }> = new Map(),
  tamanho = TAMANHO_BOTAO_RAPIDO,
): Map<string, { left: number; top: number }> {
  const obstaculos = [...obstaculosDoAmbiente];
  const resultado = new Map<string, { left: number; top: number }>();

  // 1) Preserva os já estabelecidos e transforma cada um em obstáculo.
  for (const a of ancoras) {
    const fixa = posicoesFixas.get(a.id);
    if (!fixa) continue;
    resultado.set(a.id, fixa);
    obstaculos.push(retanguloDoPos(fixa, tamanho));
  }

  // 2) Só então coloca os novos, numa ordem fixa (determinística pros
  //    mesmos ids), desviando do ambiente E dos já estabelecidos.
  const novas = ancoras.filter((a) => !resultado.has(a.id)).sort((a, b) => {
    const pa = ordemPrioridade.indexOf(a.id), pb = ordemPrioridade.indexOf(b.id);
    const ra = pa === -1 ? ordemPrioridade.length : pa;
    const rb = pb === -1 ? ordemPrioridade.length : pb;
    if (ra !== rb) return ra - rb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  for (const a of novas) {
    const pos = resolverPosicaoEdicaoRapida(a.ponto, viewport, obstaculos, tamanho);
    resultado.set(a.id, pos);
    obstaculos.push(retanguloDoPos(pos, tamanho));
  }
  return resultado;
}

function mapasIguais(a: ReadonlyMap<string, { left: number; top: number }>, b: ReadonlyMap<string, { left: number; top: number }>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, pa] of a) {
    const pb = b.get(id);
    if (!pb || pa.left !== pb.left || pa.top !== pb.top) return false;
  }
  return true;
}

/**
 * Hook que resolve as posições de TODOS os lápis ativos de uma vez —
 * é o que garante que os botões nunca colidam entre si (cada um entra
 * na lista de obstáculos dos seguintes) nem oscilem sozinhos: só
 * recalcula quando as âncoras (ids/coordenadas) ou a ordem realmente
 * mudam, nunca a cada frame do ponteiro.
 *
 * ESTABILIDADE: a posição de um lápis é preservada enquanto a âncora
 * DAQUELA área não mudar. Sem isso, o lápis de A saía do lugar assim
 * que o de B aparecia (o resolvedor recolocava os dois do zero, e a
 * ordem por id podia colocar B primeiro) — e um botão que se move
 * enquanto o ponteiro caminha até ele é impossível de clicar. Pan e
 * zoom mudam TODAS as âncoras, então ali tudo é recolocado, como deve.
 */
export function usePosicoesEdicaoRapida(
  ancoras: readonly { id: string; ponto: { x: number; y: number } }[],
  ordemPrioridade: readonly string[],
): ReadonlyMap<string, { left: number; top: number }> {
  const [posicoes, setPosicoes] = useState<ReadonlyMap<string, { left: number; top: number }>>(new Map());
  /** Onde cada id foi colocado e sob QUAL âncora — base da estabilidade acima. */
  const colocadosRef = useRef<Map<string, { ancora: string; left: number; top: number }>>(new Map());
  const chaveDaAncora = (a: { ponto: { x: number; y: number } }) => `${Math.round(a.ponto.x)}:${Math.round(a.ponto.y)}`;
  const chave = `${ancoras.map((a) => `${a.id}:${chaveDaAncora(a)}`).join("|")}#${ordemPrioridade.join(",")}`;

  const recalcular = (preservar: boolean) => {
    if (ancoras.length === 0) {
      colocadosRef.current = new Map();
      setPosicoes((p) => (p.size === 0 ? p : new Map()));
      return;
    }
    const fixas = new Map<string, { left: number; top: number }>();
    if (preservar) {
      for (const a of ancoras) {
        const anterior = colocadosRef.current.get(a.id);
        if (anterior && anterior.ancora === chaveDaAncora(a)) fixas.set(a.id, { left: anterior.left, top: anterior.top });
      }
    }
    const viewport = { largura: window.innerWidth, altura: window.innerHeight };
    const novo = resolverPosicoesEdicaoRapidas(ancoras, viewport, coletarObstaculosDoAmbiente(), ordemPrioridade, fixas);
    const registro = new Map<string, { ancora: string; left: number; top: number }>();
    for (const a of ancoras) {
      const pos = novo.get(a.id);
      if (pos) registro.set(a.id, { ancora: chaveDaAncora(a), left: pos.left, top: pos.top });
    }
    colocadosRef.current = registro;
    setPosicoes((atual) => (mapasIguais(atual, novo) ? atual : novo));
  };

  useLayoutEffect(() => {
    recalcular(true);
    // `chave` já resume tudo que `ancoras`/`ordemPrioridade` trazem de relevante — evita recalcular por causa só da referência do array mudar a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  useLayoutEffect(() => {
    // Resize muda o viewport inteiro: recoloca tudo do zero, senão uma
    // posição preservada poderia ficar fora da tela nova.
    const aoRedimensionar = () => recalcular(false);
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return posicoes;
}

export interface PropsBotaoEdicaoRapidaArea {
  /** Posição de TELA já resolvida (por `usePosicoesEdicaoRapida`, considerando todos os outros botões como obstáculo). `null` esconde esta instância. */
  posTela: { left: number; top: number } | null;
  /** Id da área DESTA instância — cada botão edita exatamente a sua própria área, nunca uma "área mostrada" global. */
  areaId: string;
  onEditar: () => void;
  /** Pointer entrou/saiu do próprio botão — mantém ESTA instância viva mesmo já fora da forma da área dela. */
  onInteragir?: (ativo: boolean) => void;
  /** Foco de teclado entrou/saiu do próprio botão — mesmo efeito de `onInteragir`. */
  onFoco?: (ativo: boolean) => void;
}

/**
 * Atalho de edição de uma área PERSISTIDA, direto no mapa. Uma
 * instância por área candidata (seleção e hover são independentes —
 * quem monta decide quantas, ver `usePosicoesEdicaoRapida` em
 * `VttClient`), cada uma com a SUA posição, o SEU id e o SEU
 * `onEditar` — nenhuma delas lê nem depende de estado de outra. Só é
 * renderizada por quem chama quando a área tem `podeEditar` — a
 * ausência do componente é a própria política de visibilidade, não um
 * `disabled` visível pra quem nunca poderia usá-la.
 */
export function BotaoEdicaoRapidaArea({ posTela, areaId, onEditar, onInteragir, onFoco }: PropsBotaoEdicaoRapidaArea) {
  if (!posTela) return null;
  // A dica abre pra baixo por padrão — perto do rodapé do viewport ela
  // teria que sair da tela, então inverte pra cima (mesmo padrão de
  // `.rv-painel .rv-dica` invertendo de lado).
  const dicaAcima = posTela.top + TAMANHO_BOTAO_RAPIDO.altura + 40 > window.innerHeight;

  return (
    <div
      className="rv-area-edicao-rapida"
      style={{ left: posTela.left, top: posTela.top }}
      // Nunca atravessa pro mapa e começa outra área por baixo.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={() => onInteragir?.(true)}
      onMouseLeave={() => onInteragir?.(false)}
    >
      <button
        type="button"
        className="rv-area-edicao-rapida-btn"
        data-testid="area-editar-rapido"
        data-area-id={areaId}
        aria-label="Editar área"
        onClick={onEditar}
        onFocus={() => onFoco?.(true)}
        onBlur={() => onFoco?.(false)}
      >
        <Pencil size={14} />
        <span className={`rv-dica${dicaAcima ? " rv-dica--acima" : ""}`}>Editar área</span>
      </button>
    </div>
  );
}
