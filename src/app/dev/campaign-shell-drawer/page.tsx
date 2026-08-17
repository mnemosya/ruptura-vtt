/**
 * Página A do harness — ver `layout.tsx` para o porquê deste teste
 * existir. Link para a página B (`./outra`) é o que exercita
 * "fechamento do painel após navegação": abrir o painel aqui, clicar
 * neste link, e o efeito de `pathname` em `PainelSessao`
 * (`CampaignShell.tsx`) deve fechá-lo sozinho — sem ele nem a página
 * remontarem (`CampaignShell` vive no layout, `{children}` é só o que
 * troca).
 *
 * `position: fixed` dentro da faixa de tela do trilho (0–52px de `left`)
 * de propósito: é a única região que o backdrop do painel NÃO cobre
 * (`.rm-drawer-backdrop` para em `left: var(--rm-rail-w)`), porque é
 * dali que a navegação "de verdade" acontece com o painel aberto. Um
 * link solto no meio do conteúdo ficaria atrás do backdrop e o clique
 * nem chegaria até ele — comportamento CORRETO de um backdrop (cobrir
 * o conteúdo por trás, poupando só o trilho), não um bug a contornar; a
 * ausência de `aria-modal`/foco preso (decisão de diálogo NÃO-MODAL, ver
 * `CampaignShell.tsx`) não muda essa parte. Testar aqui simula o mesmo
 * grau de acessibilidade que o trilho real tem, sem depender de rotas
 * de campanha autenticadas.
 */

import Link from "next/link";

export default function CampaignShellDrawerPageA() {
  return (
    <div>
      <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>Página A do harness.</p>
      <Link
        href="/dev/campaign-shell-drawer/outra"
        data-testid="harness-ir-para-b"
        style={{ position: "fixed", left: 4, bottom: 4, zIndex: 50, color: "#5ec8ff", fontSize: 11 }}
      >
        Ir para B
      </Link>
    </div>
  );
}
