"use client";

/**
 * Sobreposição de carregamento com DURAÇÃO MÍNIMA garantida — a peça
 * que faltava depois de `loading.tsx` (a fronteira `<Suspense>` do
 * Next) poder cortar o painel a qualquer momento, cedo demais pra ter
 * sido lido.
 *
 * ── Por que isto não coordena com `loading.tsx` ──────────────────────
 * Duas tentativas anteriores tentaram exatamente isso — um marcador
 * gravando quando `loading.tsx` aparecia, lido depois por um wrapper em
 * volta de `{children}`. As duas quebraram por razões ESTRUTURAIS, não
 * de implementação (explicadas com detalhe em `bootTiming.ts`): um
 * ancestral não é re-executado quando o Suspense de um descendente
 * resolve, e em navegações rápidas o Next às vezes nunca chega a
 * comitar `loading.tsx` na tela.
 *
 * Este componente usa um sinal DIFERENTE, que já existia no projeto e
 * já estava provado funcionando: `useLinkStatus()`, via
 * `NavPendingProvider`/`useNavPending` (`_design/NavPending.tsx`) — o
 * mesmo sinal que acende o glow de "destino pendente" no trilho de
 * navegação. Ele reflete a duração REAL de qualquer navegação
 * disparada por um `<Link>` rastreado, sem depender de o Suspense ter
 * chegado a pintar nada.
 *
 * ── O mecanismo ───────────────────────────────────────────────────────
 * Renderizado DENTRO da área de conteúdo (`.rm-shell-main`/
 * `.ra2-content`, que precisam de `position: relative` — ver mesa.css/
 * app.css), como uma SOBREPOSIÇÃO (`position: absolute; inset: 0`) por
 * cima do que quer que já esteja ali (conteúdo antigo, ou o
 * `loading.tsx` do Next, tanto faz — visualmente é o MESMO painel, uma
 * sobreposição opaca por cima de qualquer um dos dois é indistinguível
 * de "o painel continua na tela").
 *
 * Estado local (não Suspense, não módulo compartilhado):
 *   - `pending` (de `useNavPending()`) vira `true` assim que QUALQUER
 *     link rastreado começa a navegar.
 *   - Depois de `BOOT_OVERLAY_DELAY_MS` ainda pendente, a sobreposição
 *     aparece e grava `mostradoEm`.
 *   - Quando `pending` volta a `false` (a navegação real terminou — diagnóstico
 *     confiável, verificado antes nesta mesma sessão), a sobreposição
 *     continua até completar `BOOT_MIN_VISIBLE_MS` desde `mostradoEm`,
 *     só então some.
 *
 * ── Por que isto não é "esconder um problema atrás de animação" ──────
 * A regra do projeto é não atrasar conteúdo pra disfarçar carregamento
 * LENTO. Aqui é o oposto: quando a sobreposição decide sumir mais tarde
 * que `pending` virou falso, o conteúdo REAL já está pronto e já
 * trocou por baixo — só a REVELAÇÃO (tirar a sobreposição) é que
 * segura por uma fração de segundo, e só nos casos em que ela já tinha
 * aparecido. Nenhuma consulta espera; nenhum dado é buscado mais
 * devagar.
 *
 * ── Escopo ────────────────────────────────────────────────────────────
 * Cobre navegação disparada por `<Link>` (a esmagadora maioria — todo
 * item de trilho/sidebar). Navegação programática sem `<LinkPending>`
 * associado (ex.: `router.push` de uma Server Action) não é rastreada
 * por `useNavPending()` — nesses casos a sobreposição simplesmente não
 * aparece, e `loading.tsx` continua sendo o único feedback, sem duração
 * mínima. Aceitável: são casos raros (sair da conta, "Salvar e sair" do
 * assistente de personagem) que navegam pra FORA da casca atual.
 */
import { useEffect, useRef, useState } from "react";
import { useNavPending } from "../_design/NavPending";
import { BOOT_MIN_VISIBLE_MS, BOOT_OVERLAY_DELAY_MS } from "../_design/bootTiming";
import { BootPanel } from "./BootPanel";

export function BootMinDurationOverlay({ label }: { label: string }) {
  const pending = useNavPending();
  const [visivel, setVisivel] = useState(false);
  const mostradoEmRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (pending) {
      if (!visivel) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          mostradoEmRef.current = Date.now();
          setVisivel(true);
        }, BOOT_OVERLAY_DELAY_MS);
      }
      // Se já está visível e uma navegação NOVA começou antes da
      // anterior sumir (clique rápido em outro item), não reagenda
      // `mostradoEmRef` — a sobreposição já apareceu, a duração mínima
      // continua contando de quando ela REALMENTE surgiu na tela.
    } else if (visivel) {
      const decorrido = Date.now() - mostradoEmRef.current;
      const faltam = Math.max(0, BOOT_MIN_VISIBLE_MS - decorrido);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setVisivel(false);
      }, faltam);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pending, visivel]);

  if (!visivel) return null;

  return (
    <div className="mo-boot-stage mo-boot-overlay mo-scope" aria-busy="true">
      <BootPanel label={label} continuacao />
    </div>
  );
}
