/**
 * O esqueleto que o `loading.tsx` RAIZ dava a esta rota de graça, agora
 * declarado aqui.
 *
 * O da raiz foi removido: um Suspense na raiz envolve o app inteiro, e
 * resposta em streaming não consegue mais mudar o status HTTP — o
 * `<head>` já saiu com 200 quando a página decide chamar `notFound()`.
 * Com ele no lugar, TODA rota que chama `notFound()` respondia 200 com
 * o corpo do 404: certo para quem lê, errado para buscador, monitor,
 * cache e qualquer cliente que confia no status.
 *
 * A troca é essa: o fallback deixa de ser automático e passa a ser
 * escolhido por segmento — só onde não atrapalha o status.
 */
import { SectionLoading } from "../_boundaries/SectionLoading";

export default function PerfilLoading() {
  return <SectionLoading label="Carregando perfil…" />;
}
