/**
 * Layout da ÁREA AUTENTICADA GLOBAL — Minhas Campanhas, Personagens,
 * Compêndio e Conta.
 *
 * ── Por que este arquivo passou a existir ───────────────────────────
 * Até aqui, cada uma das quatro páginas renderizava o seu PRÓPRIO
 * `<GlobalShell>`. Funcionava, mas tinha uma consequência que só
 * aparece em movimento: a casca fazia parte da PÁGINA, não da moldura.
 * Então, em toda navegação entre as quatro, o `loading.tsx` do segmento
 * substituía a página inteira — e junto com ela iam a sidebar, os itens
 * de menu, a topbar, o fundo HUD e o cursor. A tela inteira piscava
 * para um vazio e voltava, mesmo indo de "Personagens" para
 * "Compêndio", que compartilham 90% do que está na tela.
 *
 * Com a casca AQUI, ela é um ancestral comum das quatro rotas: React a
 * mantém montada (mesmo DOM, mesmo estado — sidebar recolhida continua
 * recolhida, menu de perfil não fecha sozinho, o parallax do fundo não
 * reinicia) e o `loading.tsx` do grupo passa a renderizar DENTRO dela,
 * ocupando só a área de conteúdo. Nada compartilhado desaparece.
 *
 * ── Por que um grupo de rota `(global)` ─────────────────────────────
 * Porque `/mesas/[campaignId]` também vive sob `app/mesas/` e NÃO pode
 * receber esta casca — a campanha tem a dela (`CampaignShell`, com
 * trilho e painel de sessão próprios). Um layout em `app/mesas/`
 * embrulharia as duas. O grupo isola as quatro rotas globais sem mudar
 * uma única URL: `(global)` não aparece no caminho.
 *
 * O `app/mesas/layout.tsx` continua onde estava, com a única função que
 * sempre teve — expor o slot paralelo `@modal` da rota interceptada da
 * ficha, que precisa ficar ACIMA disto para poder cobrir tanto as rotas
 * globais quanto as da campanha.
 *
 * ── Sessão ──────────────────────────────────────────────────────────
 * O redirect para /login sai das páginas e vem para cá: era a mesma
 * checagem copiada quatro vezes, e agora precisa acontecer antes da
 * casca de qualquer forma. As páginas seguem chamando `getCurrentUser`
 * quando precisam do `user.id` para consultar — sem custo extra, porque
 * `getCurrentUser` passou a ser memoizada por request (`cache()` em
 * `lib/auth/session.ts`): layout e página compartilham a mesma
 * validação de token, não duas.
 *
 * A duração mínima do painel de carregamento NÃO é responsabilidade
 * deste arquivo — é de `BootMinDurationOverlay`, montado dentro de
 * `GlobalShell` (uma sobreposição independente da árvore de
 * `{children}}`, orientada por `useLinkStatus()`). Ver a explicação
 * completa em `_design/bootTiming.ts`.
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/session";
import { GlobalShell } from "../_global/GlobalShell";

export default async function AreaGlobalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <GlobalShell userEmail={user.email ?? "(sem email)"} displayName={user.displayName}>
      {children}
    </GlobalShell>
  );
}
