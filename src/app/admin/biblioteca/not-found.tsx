import { SectionNotFound } from "../../_boundaries/SectionNotFound";

export default function AdminBibliotecaNotFound() {
  return (
    <SectionNotFound
      title="Não encontrado na Biblioteca"
      message="Este documento, rascunho ou sessão de importação não existe, ou foi removido."
      backHref="/admin/biblioteca"
      backLabel="Biblioteca"
    />
  );
}
