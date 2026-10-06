"use client";

import type { CatalogosCriacaoV12 } from "../../../mesas/[campaignId]/vtt/_acoes/criacaoV12Actions";
import { ForjaEvolucao } from "../../../mesas/[campaignId]/vtt/_forja/ForjaEvolucao";

export function EvolucaoDev({ catalogos }: { catalogos: CatalogosCriacaoV12 }) {
  const classe = catalogos.classes[0];
  return (
    <div style={{ height: "100dvh" }}>
      <ForjaEvolucao
        catalogos={catalogos}
        campaignId={null}
        characterId="dev"
        nome="Kael Varn"
        classeSlug={classe.slug}
        partida={{ de: "E", base: { atributos: { corpo: 2, mente: 1, animo: 1 }, pericias: {}, vertentes: { biotica: 1 }, subclasse_id: classe.subclasses[0] } }}
        alvo="C"
        onSair={() => history.back()}
        onConcluir={() => alert("Concluído")}
      />
    </div>
  );
}
