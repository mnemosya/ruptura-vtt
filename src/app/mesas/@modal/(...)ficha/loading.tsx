/**
 * Estado de carregamento do Console aberto como MODAL sobre a campanha.
 *
 * ── Por que este arquivo precisa existir ────────────────────────────
 * Uma rota interceptada só troca a URL quando o segmento COMMITA. Sem
 * um boundary de Suspense por perto, "commitar" significa esperar
 * `FichaPageContent` resolver inteiro — personagem, efeitos, inventário
 * — e, até lá, clicar num personagem não produz absolutamente nada na
 * tela. Medido aqui: ~700ms a 1s de silêncio depois do clique.
 *
 * Isso funcionava por acidente antes: havia um `app/mesas/loading.tsx`
 * (o fallback de tela cheia que a revisão visual derrubou, porque
 * apagava a casca inteira) e era ELE que dava o boundary ao slot. Ao
 * removê-lo, o efeito colateral apareceu — o clique voltou a travar.
 * A correção não é ressuscitar o fallback de tela cheia: é pôr o
 * boundary onde ele de fato pertence, na própria rota interceptada,
 * onde ele só afeta o modal.
 *
 * O ganho é maior que a volta ao estado anterior: agora o clique
 * responde no ato, com o véu já escurecendo o fundo e o painel de
 * carregamento por cima — a campanha continua visível e montada por
 * baixo, que é a premissa inteira desta rota ser um modal e não uma
 * navegação cheia.
 *
 * Estilo inline no véu de propósito: `console.css` é importada pelo
 * componente cliente do Console, que é justamente o que ainda não
 * chegou quando este fallback aparece. `motion.css`, ao contrário, é
 * global — por isso o véu leva `mo-scope` (pros tokens `--mo-*` do
 * `BootPanel` resolverem) sem precisar de `console.css`.
 *
 * SEM `.mo-boot-stage` aqui de propósito: aquele utilitário centraliza
 * dentro de uma ÁREA DE CONTEÚDO que exclui chrome ao redor (rail,
 * topbar) — é o caso de `(global)/loading.tsx` e
 * `[campaignId]/loading.tsx`. Este veio é outra coisa: um VÉU DE MODAL,
 * que cobre a tela INTEIRA de propósito (é o que a Ficha real faz
 * quando abre) — `display:grid; place-items:center` sobre `inset:0` já
 * centraliza certo pro que ele é.
 */
import { BootPanel } from "../../../_boundaries/BootPanel";

export default function FichaModalLoading() {
  return (
    <div
      className="mo-scope"
      // Mesmos z-index e tratamento do `.rc-backdrop` real (500), para
      // o fallback ocupar exatamente a camada que a janela vai ocupar.
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        display: "grid",
        placeItems: "center",
        background: "rgba(4, 7, 12, 0.66)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
      aria-busy="true"
      data-testid="ficha-modal-loading"
    >
      <BootPanel label="Abrindo console" />
    </div>
  );
}
