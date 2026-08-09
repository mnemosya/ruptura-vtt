/**
 * Geometria da janela do Console — helpers puros, sem React e sem DOM,
 * para poderem ser testados isoladamente (`scripts/test-console.ts`).
 *
 * A janela é posicionada em coordenadas de viewport (x/y = canto
 * superior esquerdo). O arraste nunca pode jogá-la inteiramente para
 * fora da tela: a topbar precisa continuar alcançável, então o clamp é
 * feito sobre uma faixa mínima visível, não sobre o retângulo todo.
 */

export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  w: number;
  h: number;
}

/**
 * Tamanho mínimo da janela (spec §1): abaixo disso o conteúdo rola
 * (ver `.rc-grid` em console.css, que tem seu próprio `min-width` e
 * `.rc-body { overflow: auto }` pra rolar horizontalmente).
 *
 * 296 = largura da coluna 1 (268px) + 12px + 16px de folga pro
 * padding de `.rc-body` (console.css) — sem essa folga a coluna 1
 * aparecia cortada assim que a janela batia no mínimo. Baixo de
 * propósito pra permitir testar o breakpoint de largura mín/máx da
 * coluna 2 encolhendo a janela de verdade, em vez de travar bem antes
 * disso.
 */
export const MIN_W = 296;
/**
 * Piso de segurança pra altura — só entra em jogo antes da coluna 1
 * ser medida (primeiro paint) ou se a medição falhar por algum
 * motivo. A altura "de verdade" é dinâmica: `ConsoleWindow` mede a
 * altura natural da coluna 1 (`.rc-aside`, que parou de esticar pro
 * tamanho da linha do grid — ver `align-self: start` em
 * `.rc-aside`) e passa como teto/alvo pras funções abaixo via o
 * parâmetro opcional `alturaMaxima`. Equipamentos, mais alto, rola
 * por dentro (`.rc-tabpanel { overflow: auto }`) em vez de esticar a
 * janela — é o que evita a janela ficando enorme em telas pequenas.
 */
export const MIN_H = 480;

/** Faixa da janela que precisa continuar dentro da viewport ao arrastar. */
const MARGEM_VISIVEL_X = 180;
const MARGEM_VISIVEL_Y = 44;

/** Recuo da janela maximizada em relação às bordas da área útil. */
export const INSET_MAXIMIZADO = 12;

/**
 * Largura do trilho de abas (spec "JANELA CONSOLE" — `.rc-tabrail`,
 * 53px). Desde que o trilho virou IRMÃO de `.rc-window` (fora do
 * conteúdo interno, sempre visível), a largura total visível da janela
 * é `w + TABLIST_W`, não só `w` — sem descontar isso aqui, maximizar
 * ou arrastar o resize até o fim empurrava o trilho pra fora da
 * viewport (cortado do lado direito).
 */
export const TABLIST_W = 53;

/**
 * Soma de tudo que fica ACIMA/ABAIXO da coluna 1 na vertical, dentro
 * da janela — topbar (44) + borda+padding de `.rc-window` (1+1 * 2 =
 * 4) + padding de `.rc-body` (24 * 2 = 48). É o que converte "altura
 * medida da coluna 1" em "altura de janela equivalente" — ver
 * `registrarAlturaColuna1` em `useConsoleWindow.ts`.
 */
export const CHROME_VERTICAL = 44 + 4 + 48;

/**
 * Igual a `CHROME_VERTICAL`, mas pra largura — borda+padding de
 * `.rc-window` (4) + padding horizontal de `.rc-body` (48). NÃO inclui
 * `TABLIST_W`: o trilho fica fora de `.rc-window`, então quem soma o
 * trilho é só quem precisa da largura TOTAL visível (maximizar/resize
 * pela direita), não a conversão "largura do grid → largura da
 * janela".
 */
export const CHROME_HORIZONTAL = 4 + 48;

/** Frações de viewport usadas só no abrir (spec: não temos porquê
 * encostar nas bordas da tela quando o conteúdo é menor que isso). */
const LARGURA_INICIAL_VW = 0.86;
const ALTURA_INICIAL_VH = 0.9;

/**
 * Modo Foco (spec "Alteração do Console do Personagem: modos Painel e
 * Foco") — a janela mostra só a aba ativa, sem as colunas 1/2 fixas.
 *
 * `FOCO_MAX_W` já É a largura da JANELA (sem a tabrail), não uma
 * largura de conteúdo que precisa somar chrome — por isso é passada
 * direto como `larguraMaxima` pras funções abaixo, ao contrário do
 * modo Painel (que mede `.rc-grid` e soma `CHROME_HORIZONTAL`).
 *
 * `FOCO_ALTURA_INICIAL` é só o valor de PARTIDA (spec: "não é uma
 * altura fixa") — some assim que a altura natural do conteúdo da aba
 * ativa é medida (mesmo mecanismo do modo Painel, reaproveitado).
 */
export const FOCO_MAX_W = 818;
export const FOCO_ALTURA_INICIAL = 726;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Teto de um eixo = a MENOR entre uma fração do viewport e o "tamanho
 * natural do conteúdo" (quando informado). É o mesmo cálculo usado
 * tanto pra abrir a janela quanto pra sincronizar depois (ver
 * `useConsoleWindow.ts`) — um só lugar pra essa fórmula evita o bug
 * que motivou esse comentário: o efeito de sincronização já tinha
 * ficado, numa versão anterior, só com o teto de CONTEÚDO e sem o de
 * VIEWPORT, então numa tela pequena com coluna 1 naturalmente alta a
 * janela era empurrada pra mais alta que a própria tela.
 */
function tetoDeEixo(valorViewport: number, fracao: number, conteudoMaximo: number | undefined, minimo: number): number {
  const tetoViewport = Math.round(valorViewport * fracao);
  const teto = conteudoMaximo == null ? tetoViewport : Math.min(tetoViewport, Math.max(minimo, conteudoMaximo));
  return Math.max(minimo, teto);
}

/**
 * Geometria inicial: próxima da proporção do wireframe (~86vw × 90vh),
 * respeitando os mínimos e centralizada. Em viewports menores que o
 * mínimo a janela fica no tamanho mínimo — o conteúdo é que rola.
 *
 * `alturaMaxima`/`larguraMaxima`, quando informadas (medidas da coluna
 * 1 e do `.rc-grid`, + chrome), viram um TETO adicional — a janela não
 * abre maior que o conteúdo natural dela, mesmo em telas grandes onde
 * a fração de viewport sozinha daria uma janela bem maior. Mas o teto
 * de VIEWPORT continua valendo mesmo quando o conteúdo pede mais —
 * numa tela pequena a janela não estica além da tela só porque a
 * coluna 1 (que não encolhe) pede mais espaço do que cabe.
 */
export function geometriaInicial(vp: Viewport, alturaMaxima?: number, larguraMaxima?: number): Geometry {
  const w = tetoDeEixo(vp.w, LARGURA_INICIAL_VW, larguraMaxima, MIN_W);
  const h = tetoDeEixo(vp.h, ALTURA_INICIAL_VH, alturaMaxima, MIN_H);
  return {
    w,
    h,
    x: Math.round((vp.w - w) / 2),
    y: Math.round((vp.h - h) / 2),
  };
}

/**
 * Mantém a janela alcançável depois de arrastar ou de a viewport mudar
 * de tamanho. Permite que ela saia parcialmente da tela (comportamento
 * normal de janela), mas nunca por completo.
 */
export function limitarPosicao(geo: Geometry, vp: Viewport): Geometry {
  const minX = -(geo.w - MARGEM_VISIVEL_X);
  const maxX = vp.w - MARGEM_VISIVEL_X;
  // A topbar nunca pode subir acima do topo da viewport.
  const minY = 0;
  const maxY = vp.h - MARGEM_VISIVEL_Y;
  return { ...geo, x: clamp(geo.x, minX, maxX), y: clamp(geo.y, minY, maxY) };
}

/**
 * Redimensionamento pelo canto inferior DIREITO: a borda esquerda (x)
 * e o topo (y) não se mexem. Respeita os mínimos e não deixa a janela
 * crescer além da viewport a partir da posição atual. `alturaMaxima`/
 * `larguraMaxima` (conteúdo natural + chrome) são um segundo teto,
 * junto do teto de viewport — o usuário não consegue arrastar a janela
 * maior que o conteúdo natural mesmo tendo espaço de sobra na tela.
 */
export function redimensionar(
  geo: Geometry,
  larguraAlvo: number,
  alturaAlvo: number,
  vp: Viewport,
  alturaMaxima?: number,
  larguraMaxima?: number,
): Geometry {
  const maxWViewport = Math.max(MIN_W, vp.w - geo.x - TABLIST_W);
  const maxW = larguraMaxima == null ? maxWViewport : Math.min(maxWViewport, Math.max(MIN_W, larguraMaxima));
  const maxHViewport = Math.max(MIN_H, vp.h - geo.y);
  const maxH = alturaMaxima == null ? maxHViewport : Math.min(maxHViewport, Math.max(MIN_H, alturaMaxima));
  return {
    ...geo,
    w: clamp(Math.round(larguraAlvo), MIN_W, maxW),
    h: clamp(Math.round(alturaAlvo), MIN_H, maxH),
  };
}

/**
 * Redimensionamento pelo canto inferior ESQUERDO: espelhado do de
 * cima — quem não se mexe é a borda DIREITA (`geo.x + geo.w`) e o
 * topo (y); arrastar pra esquerda cresce a largura pela ESQUERDA (x
 * diminui). Sem o desconto de `TABLIST_W` no teto de largura: o
 * trilho fica na borda direita, que aqui é a âncora fixa — não se
 * move nesse resize, então não tem por que descontar.
 */
export function redimensionarPelaEsquerda(
  geo: Geometry,
  larguraAlvo: number,
  alturaAlvo: number,
  vp: Viewport,
  alturaMaxima?: number,
  larguraMaxima?: number,
): Geometry {
  const bordaDireita = geo.x + geo.w;
  const maxWViewport = Math.max(MIN_W, bordaDireita);
  const maxW = larguraMaxima == null ? maxWViewport : Math.min(maxWViewport, Math.max(MIN_W, larguraMaxima));
  const maxHViewport = Math.max(MIN_H, vp.h - geo.y);
  const maxH = alturaMaxima == null ? maxHViewport : Math.min(maxHViewport, Math.max(MIN_H, alturaMaxima));
  const w = clamp(Math.round(larguraAlvo), MIN_W, maxW);
  const h = clamp(Math.round(alturaAlvo), MIN_H, maxH);
  return { x: bordaDireita - w, y: geo.y, w, h };
}

/**
 * Área útil ocupada ao maximizar (com o inset visual da spec §1).
 * `alturaMaxima`/`larguraMaxima` limitam a janela maximizada ao
 * conteúdo natural pelo mesmo motivo do resize manual — sem isso,
 * maximizar recriava o problema de janela grande demais em telas com
 * bastante espaço livre.
 */
export function geometriaMaximizada(vp: Viewport, alturaMaxima?: number, larguraMaxima?: number): Geometry {
  const hViewport = Math.max(MIN_H, vp.h - INSET_MAXIMIZADO * 2);
  const h = alturaMaxima == null ? hViewport : Math.min(hViewport, Math.max(MIN_H, alturaMaxima));
  const wViewport = Math.max(MIN_W, vp.w - INSET_MAXIMIZADO * 2 - TABLIST_W);
  const w = larguraMaxima == null ? wViewport : Math.min(wViewport, Math.max(MIN_W, larguraMaxima));
  return {
    x: INSET_MAXIMIZADO,
    y: INSET_MAXIMIZADO,
    w,
    h,
  };
}
