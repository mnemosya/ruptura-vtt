"use client";

import { SectionError } from "../_boundaries/SectionError";

export default function MesasError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SectionError
      scope="mesas"
      message="Não foi possível carregar suas mesas. Tente novamente — se persistir, recarregue."
      backHref="/mesas"
      backLabel="Minhas mesas"
      error={error}
      reset={reset}
    />
  );
}
