import { SectionNotFound } from "../../../_boundaries/SectionNotFound";

export default function BibliotecaNotFound() {
  return (
    <SectionNotFound
      title="Conteúdo não encontrado"
      message="Este documento ou rascunho não existe nesta mesa, ou foi removido."
      backHref="/mesas"
      backLabel="Minhas mesas"
    />
  );
}
