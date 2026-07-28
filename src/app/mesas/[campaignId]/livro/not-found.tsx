import { SectionNotFound } from "../../../_boundaries/SectionNotFound";

export default function LivroNotFound() {
  return (
    <SectionNotFound
      title="Capítulo não encontrado"
      message="Este capítulo não existe no Livro desta mesa, ou foi removido."
      backHref="/mesas"
      backLabel="Minhas mesas"
    />
  );
}
