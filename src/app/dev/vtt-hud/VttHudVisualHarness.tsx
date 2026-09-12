"use client";

import { useMemo, useState } from "react";
import {
  computeDerivedStats,
  createInitialCharacter,
  normalizeReactionRules,
} from "../../../lib/character";
import type { SelectedTokenHudData } from "../../../lib/vtt/hudTypes";
import type { TokenApresentacao } from "../../mesas/[campaignId]/vtt/_dominio/tokenApresentacao";
import { SelectedTokenHud } from "../../mesas/[campaignId]/vtt/_shell/SelectedTokenHud";

type Scenario = "controller" | "observer" | "unlinked" | "empty";

const conditions = [
  { slug: "sangrando", name: "Sangrando", description: "Perde PV enquanto a condição estiver ativa." },
  { slug: "caido", name: "Caído", description: "Está no chão." },
  { slug: "atordoado", name: "Atordoado", description: "Tem dificuldade para agir." },
];

function tokenFor(scenario: Scenario): TokenApresentacao {
  const linked = scenario === "controller" || scenario === "observer";
  return {
    id: `fixture-${scenario}`,
    nome: scenario === "observer" ? "Sentinela do Breu" : scenario === "unlinked" ? "Eco Errante" : scenario === "empty" ? "Siv" : "Iara Voss",
    sigla: scenario === "observer" ? "SB" : scenario === "unlinked" ? "EE" : scenario === "empty" ? "SV" : "IV",
    lado: scenario === "observer" ? "pn" : "pj",
    vertente: "energetico",
    tamanho: "medio",
    pos: { q: 0, r: 0 },
    offset: { q: 0, r: 0 },
    orientacao: 0,
    pegadaPersonalizada: null,
    retrato: null,
    retratoImageId: null,
    pv: scenario === "unlinked" ? 7 : null,
    pvMax: scenario === "unlinked" ? 12 : null,
    condicoes: scenario === "unlinked" ? ["caido"] : [],
    visivel: true,
    bloqueado: false,
    characterId: linked ? `character-${scenario}` : null,
    pvPublico: true,
    pePublico: false,
    manaPublica: true,
    podeControlar: scenario !== "observer",
    revision: 3,
  };
}

function fixtureFor(scenario: Scenario): SelectedTokenHudData {
  const token = tokenFor(scenario);
  if (scenario === "observer") {
    return {
      tokenId: token.id,
      sceneId: "scene-fixture",
      campaignId: "campaign-fixture",
      name: token.nome,
      initials: token.sigla,
      imageUrl: null,
      canControl: false,
      resources: { pv: { atual: 11, max: 15 }, mana: { atual: 4, max: 8 } },
      tokenRevision: token.revision,
    };
  }

  if (scenario === "unlinked") {
    return {
      tokenId: token.id,
      sceneId: "scene-fixture",
      campaignId: "campaign-fixture",
      name: token.nome,
      initials: token.sigla,
      imageUrl: null,
      canControl: true,
      resources: { pv: { atual: 7, max: 12 } },
      visibility: { pv: true, pe: false, mana: false },
      tokenConditions: ["caido"],
      tokenRevision: token.revision,
    };
  }

  if (scenario === "empty") {
    return {
      tokenId: token.id,
      sceneId: "scene-fixture",
      campaignId: "campaign-fixture",
      name: token.nome,
      initials: token.sigla,
      imageUrl: null,
      canControl: true,
      resources: {},
      visibility: { pv: false, pe: false, mana: false },
      tokenConditions: [],
      tokenRevision: token.revision,
    };
  }

  const character = createInitialCharacter(null, token.nome);
  const derived = computeDerivedStats(character.atributos, null);
  character.recursos_atuais = { ...character.recursos_atuais, pv: 11, pe: 5, mana: 4 };
  character.estado_jogo = { pa_gastos: 1, reacoes_usadas: 1, defesas_sem_reacao: 0 };
  character.condicoes_ativas = [
    { id: "condition-1", conditionId: "sangrando", nome: "Sangrando", descricao: conditions[0].description, aplicadaEm: new Date(0).toISOString(), ativa: true },
    { id: "condition-2", conditionId: "caido", nome: "Caído", descricao: conditions[1].description, aplicadaEm: new Date(0).toISOString(), ativa: true },
  ];
  return {
    tokenId: token.id,
    sceneId: "scene-fixture",
    campaignId: "campaign-fixture",
    name: token.nome,
    initials: token.sigla,
    imageUrl: null,
    canControl: true,
    characterId: token.characterId ?? undefined,
    character,
    characterUpdatedAt: new Date(0).toISOString(),
    derived,
    resources: {
      pv: { atual: 11, max: derived.pv_max },
      pe: { atual: 5, max: derived.pe_max },
      mana: { atual: 4, max: derived.mana_max },
    },
    visibility: { pv: true, pe: false, mana: true },
    tokenRevision: token.revision,
  };
}

export function VttHudVisualHarness() {
  const [scenario, setScenario] = useState<Scenario>("controller");
  const token = useMemo(() => tokenFor(scenario), [scenario]);
  const fixture = useMemo(() => fixtureFor(scenario), [scenario]);

  return (
    <main className="hud-visual-map">
      <div className="hud-visual-grid" aria-hidden="true" />
      <nav className="hud-visual-scenarios" aria-label="Cenários do HUD">
        {(["controller", "observer", "unlinked", "empty"] as const).map((candidate) => (
          <button key={candidate} type="button" aria-pressed={scenario === candidate} onClick={() => setScenario(candidate)}>
            {candidate === "controller" ? "Controlador + ficha" : candidate === "observer" ? "Observador" : candidate === "unlinked" ? "Narrador sem ficha" : "Siv sem recursos"}
          </button>
        ))}
      </nav>
      <SelectedTokenHud
        key={token.id}
        campaignId="campaign-fixture"
        token={token}
        invalidationKey={0}
        rules={null}
        reactionRules={normalizeReactionRules(null)}
        talents={[]}
        conditions={conditions}
        canUndo
        canRedo={false}
        onUndo={() => undefined}
        onRedo={() => undefined}
        onRotate={() => undefined}
        visualFixtureData={fixture}
      />
    </main>
  );
}
