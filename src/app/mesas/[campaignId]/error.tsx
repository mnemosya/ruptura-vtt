"use client";

import { SectionError } from "../../_boundaries/SectionError";

export default function CampaignError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SectionError
      scope="mesas.campaignId"
      message="Não foi possível carregar esta mesa. Tente novamente — se persistir, recarregue."
      backHref="/mesas"
      backLabel="Minhas mesas"
      error={error}
      reset={reset}
    />
  );
}
