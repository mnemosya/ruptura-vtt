/**
 * Conversor do Compêndio (Notion → formato próprio), sem rede.
 * Fixtures no formato da API oficial do Notion, imitando o capítulo 22.
 */

import assert from "node:assert/strict";
import { converterBlocos, separarNumero, ancoraDe, type BlocoNotion } from "../src/lib/compendio/converter";
import { lerIndice } from "../src/lib/compendio/indice";

const txt = (plain_text: string, annotations: Record<string, boolean> = {}) => ({ type: "text", plain_text, annotations });
let n = 0;
const bloco = (type: string, dados: Record<string, unknown>, filhos?: BlocoNotion[]): BlocoNotion =>
  ({ id: `b${++n}`, type, [type]: dados, has_children: !!filhos?.length, filhos });

// 1. Verbete recolhível com termos, níveis e navegação descartada.
{
  const blocos: BlocoNotion[] = [
    bloco("paragraph", { rich_text: [txt("Durante o jogo, os personagens estão sujeitos a "), txt("condições", { italic: true }), txt(".")] }),
    bloco("heading_3", { rich_text: [txt("LISTA DE CONDIÇÕES")] }),
    bloco("heading_3", { rich_text: [txt("SANGRANDO", { bold: true })], is_toggleable: true }, [
      bloco("divider", {}),
      bloco("paragraph", { rich_text: [txt("A condição "), txt("Sangrando", { bold: true, code: true }), txt(" pode alcançar até 3 níveis.")] }),
      bloco("bulleted_list_item", { rich_text: [txt("Nível 1:", { bold: true }), txt(" sofre "), txt("1d6 de dano físico", { bold: true }), txt(".")] }),
      bloco("bulleted_list_item", { rich_text: [txt("Nível 2:", { bold: true }), txt(" sofre 1d8.")] }),
    ]),
    bloco("toggle", { rich_text: [txt("CEGO")] }, [bloco("paragraph", { rich_text: [txt("Efeito:", { bold: true }), txt(" falha.")] })]),
    bloco("callout", { rich_text: [txt("Anterior: ", { bold: true }), { type: "mention", plain_text: "21. CENAS DE COMBATE", mention: { type: "page", page: { id: "0210a136-3552-82b0-9ba5-0128db510387" } } }], icon: null }),
    bloco("callout", { rich_text: [txt("Dica de mesa.")], icon: { emoji: "💡" } }),
    bloco("audio", {}),
  ];
  const r = converterBlocos(blocos);
  assert.deepEqual(r.verbetes, [{ titulo: "SANGRANDO", ancora: "sangrando" }, { titulo: "CEGO", ancora: "cego" }]);
  assert.equal(r.blocos[0].tipo, "paragrafo");
  assert.deepEqual((r.blocos[0] as { texto: unknown[] }).texto[1], { texto: "condições", italico: true });
  const sangrando = r.blocos.find((b) => b.tipo === "verbete")!;
  assert.ok(sangrando.tipo === "verbete");
  const para = sangrando.filhos[1];
  assert.ok(para.tipo === "paragrafo" && para.texto.some((t) => t.termo && t.texto === "Sangrando"), "código inline vira termo");
  const lista = sangrando.filhos[2];
  assert.ok(lista.tipo === "lista" && lista.itens.length === 2, "itens vizinhos viram uma lista só");
  assert.equal(r.blocos.filter((b) => b.tipo === "destaque").length, 1, "callout de navegação sai, o outro fica");
  assert.deepEqual(r.naoSuportados, ["audio"]);
  assert.ok(r.blocos.some((b) => b.tipo === "nao_suportado"), "bloco desconhecido fica visível");
  console.log("1. verbetes, termos, listas, navegação e não suportados — OK");
}

// 2. Links internos, tabela, imagem, âncoras únicas.
{
  const blocos: BlocoNotion[] = [
    bloco("paragraph", { rich_text: [{ type: "text", plain_text: "ver capítulo", href: "https://app.notion.com/p/9d60a136355282ba8f7301ec177c75fe", annotations: {} }] }),
    bloco("table", { has_column_header: true, has_row_header: false }, [
      bloco("table_row", { cells: [[txt("Nível")], [txt("Dano")]] }),
      bloco("table_row", { cells: [[txt("1")], [txt("1d6")]] }),
    ]),
    bloco("image", { type: "file", file: { url: "https://s3/x.png" }, caption: [] }),
    bloco("toggle", { rich_text: [txt("Lento")] }, []),
    bloco("toggle", { rich_text: [txt("LENTO")] }, []),
    bloco("heading_4", { rich_text: [txt("AGARRADO")], is_toggleable: true }, [bloco("paragraph", { rich_text: [txt("x")] })]),
    bloco("heading_4", { rich_text: [txt("Subtítulo")] }),
    bloco("link_to_page", { type: "page_id", page_id: "9d60a136-3552-82ba-8f73-01ec177c75fe" }),
  ];
  const r = converterBlocos(blocos);
  const p = r.blocos[0];
  assert.ok(p.tipo === "paragrafo" && p.texto[0].paginaNotionId === "9d60a136355282ba8f7301ec177c75fe");
  const t = r.blocos[1];
  assert.ok(t.tipo === "tabela" && t.cabecalhoLinha && t.linhas.length === 2 && t.linhas[1][1][0].texto === "1d6");
  assert.ok(r.blocos[2].tipo === "imagem");
  assert.deepEqual(r.verbetes.map((v) => v.ancora), ["lento", "lento-2", "agarrado"]);
  assert.ok(r.blocos.some((b) => b.tipo === "titulo" && b.nivel === 4), "heading_4 sem toggle vira título nível 4");
  assert.ok(r.blocos.some((b) => b.tipo === "link_pagina" && b.paginaNotionId === "9d60a136355282ba8f7301ec177c75fe"));
  assert.deepEqual(r.naoSuportados, []);
  console.log("2. link interno, tabela, imagem, âncoras únicas — OK");
}

// 3. Índice da raiz: seções incluídas e excluídas.
{
  const raiz: BlocoNotion[] = [
    bloco("heading_3", { rich_text: [txt("SOB A SOMBRA DO IMPÉRIO CENTRAL")] }),
    bloco("divider", {}),
    { id: "d1d0a136-3552-8315-a098-0176a3020e19", type: "child_page", child_page: { title: "1. BRAXUS" } },
    bloco("heading_3", { rich_text: [txt("O JOGO EM MOVIMENTO")] }),
    { id: "9d60a136-3552-82ba-8f73-01ec177c75fe", type: "child_page", child_page: { title: "22. CONDIÇÕES" } },
    bloco("heading_3", { rich_text: [txt("PATCH NOTES ")] }),
    { id: "3a70a136-3552-8372-990f-81dbb97f9d29", type: "child_page", child_page: { title: "1. PATCH NOTES 1.1.0" } },
    bloco("heading_3", { rich_text: [txt("VERSÕES ANTERIORES")] }),
    { id: "b530a136-3552-82f7-aa48-01bedd531f97", type: "child_page", child_page: { title: "RUPTURA (v1.0.0)" } },
    bloco("heading_3", { rich_text: [txt("OUTROS")] }),
    { id: "3e10a136-3552-81a4-9e96-db8fa2668b18", type: "child_page", child_page: { title: "GUIA EDITORIAL" } },
  ];
  const idx = lerIndice(raiz);
  assert.deepEqual(idx.map((e) => e.tituloPagina), ["1. BRAXUS", "22. CONDIÇÕES", "1. PATCH NOTES 1.1.0"]);
  assert.equal(idx[1].secao, "O JOGO EM MOVIMENTO");
  assert.equal(idx[1].notionPageId, "9d60a136355282ba8f7301ec177c75fe");
  assert.deepEqual(idx.map((e) => e.ordem), [1, 2, 3]);
  console.log("3. índice: livro e Patch Notes entram; Versões anteriores e Outros não — OK");
}

// 4. Utilidades.
assert.deepEqual(separarNumero("22. CONDIÇÕES"), { numero: 22, titulo: "CONDIÇÕES" });
assert.deepEqual(separarNumero("GUIA"), { numero: null, titulo: "GUIA" });
assert.equal(ancoraDe("Ação Rápida!"), "acao-rapida");
console.log("4. número do capítulo e âncoras — OK");

console.log("\ntest-compendio-converter — todos os cenários passaram.");
