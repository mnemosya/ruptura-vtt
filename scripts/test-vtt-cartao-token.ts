import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyConsoleMutation,
  computeDerivedStats,
  createInitialCharacter,
  normalizeReactionRules,
  type ActiveCondition,
} from "../src/lib/character/index.js";

const flow = JSON.parse(readFileSync("content/db_fluxo_combate_normalizado_v1_1.json", "utf8"));
const reactionRules = normalizeReactionRules(flow);
const initial = createInitialCharacter(null, "HUD Teste");
const derived = computeDerivedStats(initial.atributos, null);
const context = { derived, rules: null, reactionRules, talents: [] };

const collapsed = applyConsoleMutation(initial, { type: "resource", resource: "pv", value: 0, nowIso: "2026-08-25T12:00:00.000Z" }, context);
assert.equal(collapsed.character.recursos_atuais?.pv, 0);
assert.equal(collapsed.meta.collapseStarted, "pv", "PV do HUD usa o mesmo início de Colapso da ficha.");

const pa = applyConsoleMutation(initial, { type: "pa", delta: 1 }, context);
assert.equal(pa.character.estado_jogo?.pa_gastos, 1);

const reaction = applyConsoleMutation(initial, { type: "defense" }, context);
assert.equal(reaction.meta.usedReaction, true);
assert.equal(reaction.character.estado_jogo?.reacoes_usadas, 1);

const condition: ActiveCondition = {
  id: "condition-test",
  conditionId: "caido",
  nome: "Caído",
  aplicadaEm: "2026-08-25T12:00:00.000Z",
  ativa: true,
};
const added = applyConsoleMutation(initial, { type: "condition_add", condition }, context);
assert.equal(added.character.condicoes_ativas?.at(-1)?.id, condition.id);
const removed = applyConsoleMutation(added.character, { type: "condition_remove", conditionId: condition.id, nowIso: "2026-08-25T12:01:00.000Z" }, context);
assert.equal(removed.character.condicoes_ativas?.at(-1)?.ativa, false);

const vttClient = readFileSync("src/app/mesas/[campaignId]/vtt/VttClient.tsx", "utf8");
const cartao = readFileSync("src/app/mesas/[campaignId]/vtt/_shell/CartaoTokenHover.tsx", "utf8");
const vitals = readFileSync("src/app/ficha/_console/panels/VitalsRow.tsx", "utf8");
const identity = readFileSync("src/app/ficha/_console/panels/IdentityAside.tsx", "utf8");
const conditions = readFileSync("src/app/ficha/_console/panels/PinsAndConditions.tsx", "utf8");
const migration = readFileSync("supabase/migrations/0084_vtt_selected_token_hud.sql", "utf8");
const realtime = readFileSync("src/app/mesas/[campaignId]/vtt/_realtime/vttRealtime.ts", "utf8");

assert.match(vitals, /export function ResourceControls/);
assert.match(vitals, /<ResourceControls/);
assert.match(identity, /export function PointResourceControls/);
assert.match(identity, /<PointResourceControls/);
assert.match(conditions, /export function ConditionsControls/);
assert.match(conditions, /<ConditionsControls/);
// O CARTÃO DE HOVER substituiu o HUD de token selecionado. O que este
// arquivo cobre não mudou de natureza — a projeção de servidor e a
// matemática de recurso continuam as mesmas —, mas a tela que as
// consome, sim.
assert.match(cartao, /ResourceValueCard/, "O valor editável tem que ser o MESMO componente da ficha — é o que garante a regra de \"-5\" sem uma segunda implementação.");
assert.match(vttClient, /readSelectedTokenHudAction/, "A leitura continua sendo a projeção autorizada do servidor — feita pelo mapa, no hover, pra o cartão já abrir com os recursos.");
assert.match(cartao, /mutateSelectedTokenHudAction/, "A escrita continua passando pela action, nunca direto na tabela.");
assert.doesNotMatch(cartao, /PointResourceControls|ConditionsControls/, "PA, reações e condições saíram do mapa de propósito: elas vivem na ficha.");

assert.match(vttClient, /<CartaoTokenHover/, "A mesa monta o cartão de hover.");
// A MONTAGEM (`<SelectedTokenHud`), não a palavra: a mesa continua
// chamando `readSelectedTokenHudAction` e tipando com
// `SelectedTokenHudData` — o pipeline de dados do HUD sobreviveu ao
// componente, e é ele que alimenta o cartão.
// O delimitador no fim importa: `useState<SelectedTokenHudData>` casa
// com `<SelectedTokenHud` e não é montagem nenhuma.
assert.doesNotMatch(vttClient, /<SelectedTokenHud[\s/>]/, "O HUD antigo não pode voltar a ser montado.");
assert.match(vttClient, /ATRASO_CARTAO_MS/, "O cartão só aparece depois de uma parada deliberada do ponteiro.");
// NUNCA meio cartão: o de "só o nome" é o estado de quem não tem
// permissão nenhuma, então mostrá-lo enquanto a leitura está em voo
// diria a quem TEM permissão que ela não tem. Sem dados, o gesto fica
// esperando em vez de abrir.
assert.match(vttClient, /aguardandoCartaoRef/, "Gesto sem dados espera, não abre um cartão incompleto.");
assert.match(vttClient, /\{cartaoHover && dadosCartao && \(/, "A montagem exige os dados.");
assert.match(cartao, /dados: SelectedTokenHudData;/, "E o tipo do componente proíbe montar sem eles — a regra vira tipo, não convenção.");
assert.match(vttClient, /CARENCIA_CARTAO_MS/, "E some com carência — sem ela não dá pra levar o mouse até os pips.");

// ABRIR FICHA no menu contextual do token — a porta que o HUD tinha
// ("Ficha", ao lado de desfazer/refazer) e que precisava de um lugar
// novo. Mesma condição de lá: ficha ligada E controle.
assert.match(vttClient, /t\.characterId && t\.podeControlar/, "Abrir ficha exige ficha ligada e controle.");
assert.match(vttClient, /consoleDaMesa\.abrir\(/, "Abre o Console por cima da mesa, sem navegar.");
assert.match(vttClient, /consoleDaMesa\?\.aquecer\(\)/, "E aquece o Console quando o menu abre, não quando o item é clicado.");

assert.match(migration, /pv_publico boolean not null default false/);
assert.match(migration, /pe_publico boolean not null default false/);
assert.match(migration, /mana_publica boolean not null default false/);
assert.match(migration, /create or replace function public\.read_vtt_token_hud/);
assert.match(migration, /create or replace function public\.set_vtt_token_resource_visibility/);
assert.match(migration, /create or replace function public\.update_linked_vtt_hud_character/);
assert.match(migration, /public\.is_campaign_member\(t\.campaign_id, check_user_id\)/);
assert.doesNotMatch(realtime, /table: "vtt_tokens"/, "Linha privada de token não deve entrar no payload Realtime do cliente.");

console.log("test-vtt-cartao-token: recursos, pontos, defesa, condições, seleção, autorização e projeção — OK");
