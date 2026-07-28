"use client";

import { SectionError } from "../../_boundaries/SectionError";

export default function AdminBibliotecaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SectionError
      scope="admin.biblioteca"
      message="Não foi possível carregar a Biblioteca. Tente novamente — se persistir, recarregue."
      backHref="/admin/biblioteca"
      backLabel="Biblioteca"
      error={error}
      reset={reset}
    />
  );
}
