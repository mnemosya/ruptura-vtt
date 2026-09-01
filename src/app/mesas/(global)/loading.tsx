/**
 * Carregamento da ÁREA GLOBAL (Minhas Campanhas, Personagens,
 * Compêndio, Conta).
 *
 * Este arquivo é novo, e a mudança que ele representa é a que importa:
 * o `loading.tsx` anterior morava em `app/mesas/` e, como a casca era
 * renderizada por cada PÁGINA, ele substituía a tela inteira — sidebar,
 * itens de menu, topbar, fundo HUD e cursor sumiam juntos em toda
 * navegação entre as quatro rotas, mesmo elas compartilhando quase tudo
 * o que estava na tela.
 *
 * Agora ele vive DENTRO do grupo `(global)`, cujo layout é o dono da
 * casca (ver `layout.tsx` ao lado). O fallback ocupa só a área de
 * conteúdo (`.mo-boot-stage`, centralizado dentro de `.ra2-content` —
 * que já exclui sidebar e topbar por construção); nada compartilhado
 * desaparece, e o React sequer remonta a casca — sidebar recolhida
 * continua recolhida, o parallax do fundo não reinicia.
 *
 * Este fallback NÃO tem duração mínima garantida — o React pode
 * removê-lo a qualquer momento, assim que o conteúdo real fica pronto.
 * Quem garante a permanência mínima é `BootMinDurationOverlay`,
 * montado em `GlobalShell` (uma sobreposição independente, orientada
 * por `useLinkStatus()` dos links de navegação, não por este arquivo —
 * ver a explicação completa lá e em `bootTiming.ts`, que documenta
 * duas tentativas anteriores de coordenar isto POR AQUI e por que as
 * duas quebraram estruturalmente).
 *
 * Caso-limite aceito: na PRIMEIRA entrada nesta área (ex.: logo após o
 * login), o `layout.tsx` do grupo ainda está validando a sessão, então
 * `GlobalShell` ainda não existe — `.ra2-content` não é ancestral deste
 * fallback ainda, e `min-height: 100%` (o padrão de `.mo-boot-stage`)
 * não tem contra o que resolver. O painel some da centralização
 * vertical nesse instante único e aparece perto do topo — sem quebra,
 * só sem o efeito de centro perfeito, porque não há chrome nenhum ali
 * pra excluir de qualquer forma.
 */
import { BootPanel } from "../../_boundaries/BootPanel";

export default function AreaGlobalLoading() {
  return (
    <div className="mo-boot-stage mo-scope" aria-busy="true" data-testid="area-global-loading">
      <BootPanel label="Carregando" />
    </div>
  );
}
