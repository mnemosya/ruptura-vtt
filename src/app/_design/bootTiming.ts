/**
 * Constantes de tempo do painel de carregamento (`BootPanel`) e da
 * SOBREPOSIÇÃO que garante a duração mínima dele — `BootMinDurationOverlay`,
 * em `_boundaries/BootMinDurationOverlay.tsx`.
 *
 * ── Duas versões anteriores, e por que as duas quebraram ──────────────
 * A ideia original era coordenar a duração mínima através da fronteira
 * `<Suspense>` do Next (`loading.tsx`): um marcador gravava QUANDO o
 * painel apareceu, e o conteúdo que vinha depois lia esse valor pra
 * saber quanto faltava. Duas tentativas, dois achados reais que juntos
 * provam que essa abordagem é estruturalmente inviável, não só um bug
 * de implementação:
 *
 * 1. Um componente ANCESTRAL não é re-executado quando o Suspense de um
 *    DESCENDENTE resolve — o React troca o miolo silenciosamente, sem
 *    chamar a função do ancestral de novo. Isso significa que um
 *    wrapper em volta de `{children}` não tem como decidir "mostro o
 *    painel ou o conteúdo?" depois que o Suspense interno já resolveu:
 *    na única vez que a função dele roda, o resultado do Suspense
 *    dentro de `children` ainda nem foi avaliado.
 * 2. Mesmo contornando isso, em navegações rápidas o Next às vezes NUNCA
 *    chega a comitar `loading.tsx` na tela — a suspensão resolve antes
 *    do fallback pintar um frame sequer — então não há sequer um
 *    "painel apareceu" pra marcar.
 *
 * A solução que FUNCIONA (medida, ver `BootMinDurationOverlay.tsx`) usa
 * um sinal diferente: `useLinkStatus()`, do próprio `<Link>` do Next,
 * que já é usado neste projeto pro glow de "destino pendente" no trilho
 * de navegação — e que, ao contrário do mount de `loading.tsx`, reflete
 * corretamente a duração real de QUALQUER navegação, rápida ou lenta,
 * sem depender de o Suspense ter chegado a pintar algo.
 */

/**
 * Duração mínima de PERMANÊNCIA do painel, uma vez que ele decidiu
 * aparecer — não confundir com `BOOT_OVERLAY_DELAY_MS` (o atraso ANTES
 * de aparecer): são dois eixos independentes.
 *   - O atraso decide SE mostra (fica de fora navegação rápida demais
 *     pra justificar um painel).
 *   - Isto decide, uma vez que já decidiu mostrar, por quanto tempo NO
 *     MÍNIMO — pra não virar um lampejo em navegações que resolvem logo
 *     depois de cruzar o atraso.
 * 550ms: suficiente pra ler "CARREGANDO" e ver a barra se mexer pelo
 * menos uma vez, curto o bastante pra não parecer travado.
 */
export const BOOT_MIN_VISIBLE_MS = 550;

/**
 * Atraso ANTI-FLASH antes da sobreposição aparecer — mesmo piso de
 * `--mo-delay-busy` (motion.css): abaixo disso, uma navegação lê como
 * instantânea, e mostrar um painel inteiro pra ela seria mais ruído que
 * ajuda.
 */
export const BOOT_OVERLAY_DELAY_MS = 120;
