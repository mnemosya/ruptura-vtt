import { SectionNotFound } from "../../_boundaries/SectionNotFound";

export default function CampaignNotFound() {
  return (
    <SectionNotFound
      title="Mesa não encontrada"
      message="Esta mesa não existe, foi removida, ou você não tem acesso a ela."
      backHref="/mesas"
      backLabel="Minhas mesas"
    />
  );
}
