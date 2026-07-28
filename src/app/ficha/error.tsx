"use client";

import { SectionError } from "../_boundaries/SectionError";

export default function FichaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SectionError
      scope="ficha"
      message="Não foi possível carregar a ficha. Tente novamente — se persistir, recarregue."
      backHref="/mesas"
      backLabel="Minhas mesas"
      error={error}
      reset={reset}
    />
  );
}
