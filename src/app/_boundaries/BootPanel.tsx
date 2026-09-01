/**
 * Painel de carregamento compartilhado — o ÚNICO desenho de "carregando"
 * do projeto fora do Console.
 *
 * Server Component (sem `"use client"`): é markup e CSS, nenhum hook —
 * mas ver a prop `continuacao` abaixo, usada por um CONSUMIDOR client.
 *
 * ── O que ele substituiu, e por quê ─────────────────────────────────
 * Antes cada boundary desenhava uma tela cheia de blocos de esqueleto.
 * A revisão visual derrubou isso por dois motivos, os dois corretos:
 *
 * 1. Esqueleto só se justifica quando imita a forma do que vai chegar E
 *    o resto da tela permanece. O "resto permanece" agora é verdade de
 *    verdade — a casca subiu para os layouts (ver
 *    `app/mesas/(global)/layout.tsx`), então sidebar, menu, topbar e
 *    fundo HUD não somem mais em navegação nenhuma. Sobra só a área de
 *    conteúdo, cuja forma muda por completo entre rotas (grid de cards,
 *    lista, formulário, capítulo). Um esqueleto genérico ali promete
 *    uma forma e entrega outra.
 * 2. Bloco cinza pulsando é vocabulário de outra família de produto.
 *    O desenho aqui segue a referência pedida (Cyberpunk 2077 e os
 *    sites oficiais): painel angular de canto cortado, rótulo em mono
 *    caixa-alta com tracking largo, cursor de bloco piscando e uma
 *    barra de blocos que CRESCE.
 *
 * ── Centralização ────────────────────────────────────────────────────
 * Este componente NÃO se centraliza sozinho — ele não sabe (nem deve
 * saber) quanto espaço tem disponível, e esse espaço muda por
 * consumidor: `.rm-shell-main` na campanha, `.ra2-content` na área
 * global, uma coluna estreita em `SectionLoading`. Cada consumidor
 * embrulha `<BootPanel>` em `.mo-boot-stage` (motion.css), que centra
 * dentro do que quer que seja o ancestral de altura real — e essa
 * altura JÁ exclui trilho/sidebar e cabeçalho/topbar por construção,
 * então "centralizado" aqui nunca é "por cima do menu".
 *
 * ── A moldura chega INTEIRA; quem muda é a barra ─────────────────────
 * Uma versão anterior fazia a MOLDURA aparecer aos poucos — um reveal em
 * blocos, `clip-path` progressivo. Reportado direto: parecia que o
 * painel "não começava inteiro". Revertido: `.mo-boot-in` (o wrapper,
 * abaixo) faz só um fade CURTO de opacidade (140ms) — a moldura, o
 * rótulo e o cursor chegam juntos, como uma peça só.
 *
 * O que SINALIZA "ainda em curso" é exclusividade da barra
 * (`.mo-boot-bar`). Passou por DUAS versões antes desta: uma barra com
 * um brilho deslizando por dentro (lia como decoração, não como
 * progresso), depois três pontos fixos pulsando (pequenos e apagados
 * demais pra notar, e "três" nunca muda — sem sensação de avanço).
 * Nesta versão os blocos da barra ACENDEM EM SEQUÊNCIA conforme um
 * preenchimento cresce da esquerda pra direita, até cobrir tudo, e
 * reinicia — é literalmente "mais quadradinhos acesos a cada
 * instante", o gesto que faltava.
 *
 * ── Por que este painel some rápido demais, e como isso é corrigido ──
 * ESTE componente sozinho não consegue garantir uma duração mínima de
 * permanência: ele é o retrato de espera de uma fronteira `<Suspense>`
 * do Next, e o React o desmonta no exato instante em que o conteúdo
 * real fica pronto — nenhum CSS ou estado local aqui dentro consegue
 * adiar esse desmonte.
 *
 * A garantia de permanência mínima existe, mas mora FORA daqui: em
 * `BootMinDurationReveal` (embrulhando `{children}` nos layouts
 * persistentes), que RENDERIZA ESTE MESMO PAINEL por conta própria,
 * como continuação, se o conteúdo real chegou rápido demais. É pra essa
 * continuação que existe a prop `continuacao` — pula o atraso de
 * entrada (`--mo-delay-boot`) e o fade, porque não é uma NOVA aparição
 * decidindo se vale a pena mostrar; é a mesma aparição de antes,
 * seguindo. Ver `bootTiming.ts` pra entender a ponte entre os dois.
 *
 * A aparição normal (sem `continuacao`) ainda tem seu próprio atraso
 * anti-flash (`--mo-delay-boot`) — cobre respostas genuinamente
 * rápidas; NÃO é garantia de "rota já visitada" nas quatro rotas
 * globais, que são `force-dynamic` e refazem a consulta a cada
 * navegação (ver a nota completa em `motion.css`, que também explica
 * por que este atraso é curto — 120ms — desde que a garantia de
 * permanência mínima passou a ser real, via `BootMinDurationReveal`).
 *
 * ── Acessibilidade ──────────────────────────────────────────────────
 * `role="status"` no painel: o rótulo é texto de verdade, lido por
 * leitor de tela. O estado nunca depende do movimento — em
 * `prefers-reduced-motion` a moldura aparece do mesmo jeito (só o fade
 * cai quase a zero) e a barra fica CHEIA e parada, sem o ciclo de
 * crescer-e-reiniciar.
 *
 * ── `mo-scope` ──────────────────────────────────────────────────────
 * Fica no wrapper de centralização (`.mo-boot-stage`), não aqui: as
 * escalas `--mo-*` são declaradas por ESCOPO (`.rm-root`/`.ra-root`/
 * `.rv-root`/`.mo-scope`), nunca em `:root` — decisão herdada de
 * `tokens.css` para manter verificável a asserção de que os tokens do
 * redesign não vazam para dentro do Console. Alguns boundaries (o de
 * /admin, /login, /join e o da campanha em entrada fria) renderizam
 * FORA das cascas, e sem `mo-scope` os `var(--mo-*)` cairiam pro valor
 * inicial.
 */
export function BootPanel({
  label,
  continuacao = false,
}: {
  label: string;
  /**
   * `true` quando `BootMinDurationReveal` está reaproveitando o painel
   * do lado do CONTEÚDO, pra completar a duração mínima que a fronteira
   * `<Suspense>` já cortou. `style` inline (não uma classe) de
   * propósito: precisa vencer o `animation` já declarado pela classe
   * `.mo-boot-in` em `motion.css`, e uma propriedade longhand inline
   * sempre vence a curta declarada em folha externa, não importa a
   * ordem — é o mecanismo mais simples e não precisa de `!important`.
   */
  continuacao?: boolean;
}) {
  return (
    <div
      className="mo-boot-in"
      style={continuacao ? { animationDelay: "0ms", animationDuration: "0.01ms" } : undefined}
    >
      <div className="mo-boot" role="status">
        <span className="mo-boot-label">
          {label}
          <span className="mo-boot-caret" aria-hidden="true" />
        </span>
        <span className="mo-boot-bar" aria-hidden="true" />
      </div>
    </div>
  );
}
