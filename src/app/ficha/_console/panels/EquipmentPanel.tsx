"use client";
import { itemDescription } from "../../../../lib/character/itemDescription";
import { itemDisplayName } from "../../../../lib/character/itemDisplayName";

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

import { espacosDoItem, espacosDaInstancia } from "../../../../lib/character/carga";
import type { InventoryItemInstance, ItemContent } from "../../../../lib/character";
import { itemCabeNoSlot, type BodySlot, type BodySlotId } from "../slots";
import type { ConsoleApi } from "../types";
import { TextoComRegras } from "../TextoComRegras";
import { CabecalhoModulo } from "./CabecalhoModulo";
import { EquipamentoHud, type EncaixeHud, type PecaHud } from "./hud/EquipamentoHud";
import { grupoESubDoModelo, temaDoModelo, VERTENTE_DA_CATEGORIA, descricaoDeOcultavel, descricaoDoPorte, descricaoDaMunicao, descricaoDoAlcance, descricaoDoDano } from "./InventarioPanel";

/** Item do inventário → peça do HUD de equipamento (também alimenta o modal de item do Inventário). */
export function pecaDe(api: ConsoleApi, inst: InventoryItemInstance): PecaHud {
  const modelo = api.catalogo.get(inst.itemSlug);
  const categoria = modelo?.categoria ?? inst.categoria;
  const dano = descricaoDoDano(modelo);
  const alcance = descricaoDoAlcance(modelo);
  const ocultavel = descricaoDeOcultavel(modelo);
  const linhas: { rotulo: string; valor: string }[] = [];
  const porte = descricaoDoPorte(modelo);
  if (porte) linhas.push({ rotulo: "Porte", valor: porte });
  const municao = descricaoDaMunicao(modelo);
  if (municao) linhas.push({ rotulo: "Munição", valor: municao });
  if (alcance) linhas.push({ rotulo: "Alcance", valor: alcance });
  if (modelo?.capacidadeMochila) linhas.push({rotulo:"Capacidade",valor:`${modelo.capacidadeMochila} espaços`});
  if (modelo?.maos) linhas.push({rotulo:"Mãos",valor:String(modelo.maos)});
  if (inst.aljava) linhas.push({rotulo:"Munição armazenada",valor:`${inst.aljava.stacks.reduce((n,s)=>n+s.quantidade*(s.pesoCapacidade??1),0)}/${inst.aljava.capacidade}`});
  if (ocultavel) linhas.push({ rotulo: "Ocultável", valor: ocultavel });
  // Valor do item (o mesmo "₳ 1.500" da coluna Valor da lista do Inventário).
  if (modelo?.preco) linhas.push({ rotulo: "Valor", valor: `₳ ${modelo.preco.toLocaleString("pt-BR")}` });
  const propriedades = api.propriedadesDoItem(inst.id).filter(t => !/ocult/i.test(`${t.slug} ${t.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`)).map(t => ({ nome: t.nome, descricao: t.descricao }));
  const descricao = itemDescription(modelo, [...linhas.map(l => l.rotulo), ...(dano ? ["Dano"] : []),
    ...(propriedades.length ? ["Propriedades"] : []), ...(modelo?.mitMax != null ? ["MIT", "Proteção"] : []),
    ...(modelo?.pdMax != null ? ["PD", "Proteção"] : []), ...(modelo?.regioes && modelo.regioes.length > 1 ? ["Cobertura"] : [])]);
  return {
    id: inst.id,
    nome: itemDisplayName(inst, modelo),
    weaponName: modelo?.nome,
    tipo: modelo ? grupoESubDoModelo(modelo).tipo : null,
    suporteMunicao: !!modelo?.suporteMunicao,
    modosAtaque: modelo?.modosAtaque, modoAtaqueEscolhido: inst.modoAtaqueEscolhido,
    temaCategoria: modelo ? temaDoModelo(modelo, "equipamentos") : undefined,
    duasMaos: modelo?.maos === 2,
    // "Ocultável" já tem linha própria (Sim/Parcial/Não) — como etiqueta, contradizia o "Não".
    propriedades,
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
    descricao: descricao ? <TextoComRegras texto={descricao} glossario={api.glossario} /> : null,
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
  const secundaria = por("arma_secundaria");

  const encaixes: Record<EncaixeHud, PecaHud | null> = {
    traje: peca(por("traje")),
    acessorio_1: peca(por("acessorio_1")),
    acessorio_2: peca(por("acessorio_2")),
    estrutura_dorsal: peca(por("estrutura_dorsal")),
    locomocao: peca(por("locomocao")),
    mochila_equipada: peca(por("mochila_equipada")),
    suporte_municao: peca(por("suporte_municao")),
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
      .filter((i) => (i.estado === "mochila" || i.estado === "abrigo") && !ocupados.has(i.id) && itemCabeNoSlot(api.catalogo.get(i.itemSlug), e) && (!e.startsWith("acesso_rapido") || espacosDaInstancia({...i,estado:"mochila"},api.catalogo.get(i.itemSlug)) <= 1))
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
            onMover={(id, estado) => api.moverItemPara(id, estado)}
            onDescartar={(id) => api.descartarItem(id)}
            onModoAtaque={(id, modo) => api.definirModoAtaque?.(id, modo)}
            onDefinirMit={(id, v) => api.definirMit(id, v)}
            onDefinirPd={(id, v) => api.definirPd(id, v)}
            onDefinirMunicao={(id, v) => api.definirMunicao(id, v)}
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
