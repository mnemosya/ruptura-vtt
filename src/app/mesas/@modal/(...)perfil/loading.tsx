/**
 * Estado de carregamento do Perfil aberto como MODAL sobre a campanha.
 * Gêmeo de `@modal/(...)ficha/loading.tsx`, pela mesma razão que está
 * escrita lá, e que vale igual aqui:
 *
 * uma rota interceptada só troca a URL quando o segmento COMMITA. Sem
 * um boundary de Suspense por perto, "commitar" significa esperar
 * `PerfilPageContent` resolver inteiro — e, até lá, clicar em "perfil"
 * não produz nada na tela.
 *
 * Este slot nunca teve boundary próprio: quem o cobria era o
 * `app/loading.tsx` RAIZ, de tabela. A raiz saiu (um Suspense ali
 * envolve o app inteiro, põe TODA resposta em streaming e impede
 * `notFound()` de responder 404 em qualquer rota), e o modal ficou sem
 * nada — o mesmo acidente que o comentário da ficha já contava, de novo.
 * A correção é a mesma: o boundary mora na rota interceptada, onde só
 * afeta o modal.
 *
 * Estilo inline, e não `.rv-perfil-veu`: `perfil.css` é importada por
 * `PerfilPageContent`, que é justamente o que ainda não chegou aqui.
 * Os valores são os do véu real (`perfil.css`) para o fallback ocupar
 * exatamente a camada que a janela vai ocupar. `mo-scope` fica para os
 * tokens `--mo-*` do `BootPanel` resolverem — `motion.css` é global.
 */
import { BootPanel } from "../../../_boundaries/BootPanel";

export default function PerfilModalLoading() {
  return (
    <div
      className="mo-scope"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "grid",
        placeItems: "center",
        padding: "24px 16px",
        background: "rgba(2, 8, 12, 0.72)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
      }}
      aria-busy="true"
      data-testid="perfil-modal-loading"
    >
      <BootPanel label="Abrindo perfil" />
    </div>
  );
}
