"use client";

/**
 * Aba EQUIPAMENTOS — o "ripperdoc" (`hud/EquipamentoHud.tsx`) ligado
 * ao personagem.
 *
 * Este arquivo é só o ADAPTADOR: lê a projeção de slots (`slots.ts`),
 * o inventário e o catálogo, monta as peças do HUD e encaminha as
 * ações para o `ConsoleApi` — que por sua vez chama fluxos que já
 * logam e salvam. Nenhuma regra nova mora aqui.
 *
 * O escudo ocupa a mão secundária: no modelo são flags independentes
 * (`equipadoDefensivo` × `empunhado[1]`), na tela é um encaixe só, com o
 * escudo à frente quando os dois existem — a mesma decisão de antes.
 */

import { espacosDoItem } from "../../../../lib/character/carga";
import type { InventoryItemInstance, ItemContent } from "../../../../lib/character";
import { itemCabeNoSlot, type BodySlot, type BodySlotId } from "../slots";
import type { ConsoleApi } from "../types";
import { TextoComRegras } from "../TextoComRegras";
import { CabecalhoModulo } from "./CabecalhoModulo";
import { EquipamentoHud, type EncaixeHud, type PecaHud } from "./hud/EquipamentoHud";
import { VERTENTE_DA_CATEGORIA, descricaoDeOcultavel, descricaoDoAlcance, descricaoDoDano } from "./InventarioPanel";

function pecaDe(api: ConsoleApi, inst: InventoryItemInstance): PecaHud {
  const modelo = api.catalogo.get(inst.itemSlug);
  const categoria = modelo?.categoria ?? inst.categoria;
  const dano = descricaoDoDano(modelo);
  const alcance = descricaoDoAlcance(modelo);
  const ocultavel = descricaoDeOcultavel(modelo);
  const linhas: { rotulo: string; valor: string }[] = [];
  if (alcance) linhas.push({ rotulo: "Alcance", valor: alcance });
  if (ocultavel) linhas.push({ rotulo: "Ocultável", valor: ocultavel });
  return {
    id: inst.id,
    nome: inst.itemNome,
    categoria,
    categoriaRotulo: modelo?.categoria_label ?? categoria,
    vertente: VERTENTE_DA_CATEGORIA[categoria] ?? "nenhuma",
    raridade: modelo?.raridade ?? null,
    onde: inst.estado === "abrigo" ? "abrigo" : inst.estado === "mochila" ? "mochila" : "equipado",
    espacos: espacosDoItem(modelo),
    protecao: modelo?.tipoProtecao ?? null,
    mit: modelo?.mitMax != null ? [inst.mitAtual ?? modelo.mitMax, modelo.mitMax] : null,
    pd: modelo?.pdMax != null ? [inst.pdAtual ?? modelo.pdMax, modelo.pdMax] : null,
    regioes: modelo?.regioes ?? [],
    dano: dano ? { dado: dano.dado, tipo: dano.tipo } : null,
    municao: modelo?.municaoMax != null ? [inst.municaoAtual ?? modelo.municaoMax, modelo.municaoMax] : null,
    usavel: modelo != null && (modelo.custoPaUso != null || modelo.cargasMax != null),
    descricao: modelo?.descricao_curta ? <TextoComRegras texto={modelo.descricao_curta} glossario={api.glossario} /> : null,
    linhas,
  };
}

export function EquipmentPanel({
  slots,
  api,
  onAbrirAtaque,
  onRecarregar,
}: {
  slots: BodySlot[];
  api: ConsoleApi;
  /** Mantido na assinatura: a gaveta do HUD substituiu a mochila filtrada. */
  onAbrirVazio?: (slot: BodySlotId) => void;
  onAbrirAtaque: (inst: InventoryItemInstance, modelo: ItemContent, slot: "arma_primaria" | "arma_secundaria") => void;
  onUsarItem?: (inst: InventoryItemInstance, modelo: ItemContent | undefined) => void;
  onRecarregar: (inst: InventoryItemInstance) => void;
}) {
  const por = (id: BodySlotId) => slots.find((s) => s.id === id)?.instance ?? null;
  const inventario = api.character.inventario ?? [];
  const porId = new Map(inventario.map((i) => [i.id, i]));
  const peca = (i: InventoryItemInstance | null) => (i ? pecaDe(api, i) : null);
  const secundaria = por("escudo") ?? por("arma_secundaria");

  const encaixes: Record<EncaixeHud, PecaHud | null> = {
    cabeca: peca(por("cabeca")),
    tronco: peca(por("tronco")),
    membro_superior: peca(por("membro_superior")),
    membro_inferior: peca(por("membro_inferior")),
    arma_primaria: peca(por("arma_primaria")),
    arma_secundaria: peca(secundaria),
    acesso_rapido_1: peca(por("acesso_rapido_1")),
    acesso_rapido_2: peca(por("acesso_rapido_2")),
  };
  const ocupados = new Set(Object.values(encaixes).filter(Boolean).map((p) => p!.id));

  /* Candidatos: o que está na mochila ou no abrigo e cabe no encaixe
     (`itemCabeNoSlot`, a mesma regra de sempre). Do abrigo, a ação é
     trazer para a mochila; equipar direto do abrigo não existe. */
  const candidatos = (e: EncaixeHud): PecaHud[] =>
    inventario
      .filter((i) => (i.estado === "mochila" || i.estado === "abrigo") && !ocupados.has(i.id) && itemCabeNoSlot(api.catalogo.get(i.itemSlug), e))
      .map((i) => pecaDe(api, i));

  return (
    <section aria-label="Equipamentos" className="rc-eq-outer">
      <div className="rc-eq-card-outer rc-inv-moldura">
        <CabecalhoModulo id="ID://EQUIPAMENTO" mod="MOD.GEAR // 06" />
        <div className="rc-inv" data-testid="console-equipamentos">
          <EquipamentoHud
            encaixes={encaixes}
            candidatos={candidatos}
            somenteLeitura={api.somenteLeitura}
            onEquipar={(id, e) => api.equiparNoSlot(id, e)}
            onTirar={(id) => api.desequipar(id)}
            onTrazer={(id) => api.moverItemPara(id, "mochila")}
            onDefinirMit={(id, v) => api.definirMit(id, v)}
            onDefinirPd={(id, v) => api.definirPd(id, v)}
            onAtacar={(e) => {
              const inst = e === "arma_primaria" ? por("arma_primaria") : secundaria;
              const modelo = inst ? api.catalogo.get(inst.itemSlug) : undefined;
              if (inst && modelo) onAbrirAtaque(inst, modelo, e);
            }}
            onRecarregar={(id) => { const inst = porId.get(id); if (inst) onRecarregar(inst); }}
            onUsar={(id) => api.usarItem(id)}
          />
        </div>
      </div>
    </section>
  );
}
