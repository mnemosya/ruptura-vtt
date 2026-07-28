"use client";

import { SectionError } from "../../_boundaries/SectionError";

export default function JoinError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SectionError
      scope="join.token"
      message="Não foi possível verificar este convite. Tente novamente — se persistir, peça um novo link ao narrador."
      backHref="/login"
      backLabel="Entrar"
      error={error}
      reset={reset}
    />
  );
}
