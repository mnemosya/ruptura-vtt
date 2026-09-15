"use client";

/**
 * Vitrine da aba INVENTÁRIO do Console.
 *
 * Os itens são FIXTURE, e de propósito: a aba precisa ser vista cheia
 * — com pilha de três, com item de uma unidade só, com e sem
 * propriedades, com efeito longo — antes de existir inventário de
 * verdade ligado nela. São os mesmos itens do desenho, pra que a
 * comparação com o Figma seja direta.
 *
 * `.rc-root` em volta não é enfeite: os tokens do Console (`--rc-*`,
 * `--cy`, `--am`) são declarados naquele escopo, e sem ele as cores
 * caem no valor inicial — a vitrine mostraria uma aba sem paleta.
 */

import { InventarioPanel, type ItemDoInventario } from "../../ficha/_console/panels/InventarioPanel";

const ITENS: ItemDoInventario[] = [
  {
    id: "granada", nome: "Granada de choque", categoria: "Explosivo", familia: "explosivo",
    local: "mochila", quantidade: 1, espacos: 1, raridade: "Incomum", custoPa: 2, precoBase: 250,
    descricao: "Modelo de granada compacta que libera descarga elétrica radial. Muito usada para conter grupos rapidamente.",
    propriedades: [
      { rotulo: "Alcance", valor: "10 metros" },
      { rotulo: "Alvo", valor: "Esfera ◎, 2 m de raio" },
      { rotulo: "Duração", valor: "Instantâneo" },
    ],
    efeito: [
      "Todos em um raio de 3 m fazem teste de ",
      { termo: "Resistir" },
      " CD 8; em falha, ficam ",
      { termo: "Atordoados", tom: "condicao" },
      " até o fim do próximo turno deles.",
    ],
  },
  {
    id: "halfling", nome: "Halfling X8-1", categoria: "Espada curta", familia: "arma",
    local: "equipado", quantidade: 1, espacos: 1, raridade: "Comum", custoPa: 1, precoBase: 90,
    descricao: "Lâmina curta de manutenção simples, comum entre corredores de carga.",
    propriedades: [{ rotulo: "Alcance", valor: "Corpo a corpo" }, { rotulo: "Dano", valor: "1d6 cortante" }],
  },
  {
    id: "beijo", nome: "Beijo de bruxa", categoria: "Vertina", familia: "vertina",
    local: "mochila", quantidade: 2, espacos: 1, raridade: "Rara", custoPa: 1, precoBase: 320,
    descricao: "Frasco de vertina destilada. O gosto some antes do efeito começar.",
    propriedades: [{ rotulo: "Duração", valor: "1 cena" }],
    efeito: ["Recupera 2d4 de ", { termo: "PE" }, " e causa 1 de dano por uso seguido."],
  },
  {
    id: "escudo", nome: "Escudo balístico", categoria: "Escudo", familia: "escudo",
    local: "equipado", quantidade: 1, espacos: 2, precoBase: 180,
    descricao: "Placa de polímero balístico com alça dupla.",
    propriedades: [{ rotulo: "Defesa", valor: "+2" }],
  },
  {
    id: "medkit", nome: "Med-kit", categoria: "Farmácia", familia: "farmacia",
    local: "mochila", quantidade: 3, espacos: 1, custoPa: 2, precoBase: 60,
    descricao: "Kit de campo para estabilizar ferimentos fora de abrigo.",
    efeito: ["Remove ", { termo: "Sangrando", tom: "condicao" }, " e recupera 1d6 de PV."],
  },
  {
    id: "chip", nome: "Chip de dados", categoria: "Utilitário", familia: "utilitario",
    local: "mochila", quantidade: 2, espacos: 1, precoBase: 25,
    descricao: "Armazena um pacote de dados roubado. Sem leitor, é só plástico.",
  },
  {
    id: "edgelord", nome: "Edgelord KS-4", categoria: "Espada longa", familia: "arma",
    local: "abrigo", quantidade: 1, espacos: 2, raridade: "Muito rara", custoPa: 2, precoBase: 1200,
    descricao: "Lâmina monomolecular de série limitada. Guardada no abrigo por bom senso.",
    propriedades: [{ rotulo: "Alcance", valor: "Corpo a corpo" }, { rotulo: "Dano", valor: "1d10 cortante" }],
  },
];

export function VitrineInventario() {
  return (
    <div className="rc-root gal-inv-palco">
      <InventarioPanel itens={ITENS} capacidadeTotal={15} />
    </div>
  );
}
