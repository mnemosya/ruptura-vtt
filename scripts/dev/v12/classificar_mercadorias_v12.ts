/** Classificação estrutural das mercadorias; casos ambíguos ficam explícitos para revisão. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CATEGORIA_ITEM_LABELS } from "../../../src/lib/contentSchema/itemLabels";

type Mercadoria = {
  id: string; nome: string; categoria: string; tipo_tabela: string; secao: string[];
  slug_sugerido: string; fonte: { paginaNotionId: string; tabelaBlocoId: string | null; linhaBlocoId: string };
};
type Classe = {
  content_type_proposto: "item" | "rune" | "escalpo" | "companion_model" | null;
  categoria_proposta: string | null;
  subtipo_proposto: string | null;
  situacao: "mapeavel" | "ampliar_schema_item" | "definir_modelo" | "revisao_editorial";
  observacao?: string;
  vinculos_sugeridos?: { content_type: "escalpo"; slugs: string[]; criterio: string };
};

const raiz = resolve("content/v12");
const fonte = JSON.parse(await readFile(resolve(raiz, "db_mercadorias_v1_2_rascunho.json"), "utf8"));
const mercadorias = fonte.mercadorias as Mercadoria[];
const item = (categoria: string, subtipo: string | null = null): Classe => ({
  content_type_proposto: "item", categoria_proposta: categoria, subtipo_proposto: subtipo,
  situacao: categoria in CATEGORIA_ITEM_LABELS ? "mapeavel" : "ampliar_schema_item",
});
const especializado = (tipo: "rune" | "escalpo" | "companion_model", subtipo: string | null = null): Classe => ({
  content_type_proposto: tipo, categoria_proposta: null, subtipo_proposto: subtipo, situacao: "mapeavel",
});

function classificar(m: Mercadoria): Classe {
  switch (m.categoria) {
    case "ACESSÓRIOS": return item("acessorio");
    case "ARMAS": {
      if (m.tipo_tabela === "Arma") return item("arma", m.secao[0] ?? null);
      if (m.tipo_tabela === "Runa") return especializado("rune", m.secao[0] ?? null);
      if (["Tipo", "Flecha", "Munição", "Célula"].includes(m.tipo_tabela)) return item("municao", m.tipo_tabela);
      break;
    }
    case "ARMADURAS E ESCUDOS": {
      if (m.tipo_tabela === "Armadura") return item("armadura", m.secao[1] ?? null);
      if (m.tipo_tabela === "Escudo") return item("escudo", m.secao[1] ?? null);
      if (m.tipo_tabela === "Runa") return especializado("rune", m.secao[0] ?? null);
      break;
    }
    case "DISPOSITIVOS TECNOLÓGICOS": return item("dispositivo");
    case "DRONES E ROBÔS": {
      if (m.tipo_tabela === "Drone") return especializado("companion_model", "drone");
      if (m.tipo_tabela === "Robô") return especializado("companion_model", "robo");
      if (m.tipo_tabela === "Runa") return especializado("rune", "drone_robo");
      break;
    }
    case "ESCALPOS": {
      if (/^RPI Forjado \(Nível [1-3]\)$/i.test(m.nome)) return especializado("escalpo", "identidade");
      if (m.nome === "CDI Craqueada") return {
        ...item("dispositivo", "carteira_digital"),
        observacao: "Decisão da autora: item separado vinculado ao RPI. O vínculo ainda precisa de contrato na ficha.",
        vinculos_sugeridos: { content_type: "escalpo", slugs: [], criterio: "RPI ativo; vínculo confirmado pela autora, alvo exato a modelar" },
      };
      if (m.nome.startsWith("↳")) return {
        content_type_proposto: null, categoria_proposta: null, subtipo_proposto: "modulo_escalpo",
        situacao: "definir_modelo", observacao: "Módulo instalado em escalpo-base; requer vínculo e compatibilidade, não é escalpo independente.",
      };
      if (m.tipo_tabela === "Veneno") return item("veneno");
      return especializado("escalpo", m.secao[1] ?? null);
    }
    case "EXPLOSIVOS": return item("explosivo");
    case "FARMÁCIA": return item("farmacia");
    case "FERRAMENTAS E UTILIDADES": return item("ferramenta");
    case "MOBILIDADE": {
      if (m.tipo_tabela === "Modelo") return item("veiculo", m.secao[1] ?? null);
      if (m.tipo_tabela === "Verbete sem tabela") return item("modulo_veicular");
      if (m.tipo_tabela === "Item") return item("mobilidade");
      break;
    }
    case "TRAJES": return item("traje");
    case "VERTINAS": return item("vertina");
  }
  throw new Error(`Sem regra estrutural para ${m.categoria} / ${m.tipo_tabela}: ${m.nome}`);
}

const porId = new Map(mercadorias.map((m) => [m.id, m]));
const linhas = mercadorias.map((m) => ({
  id: m.id, slug_sugerido: m.slug_sugerido, nome: m.nome, pagina: m.categoria, secao: m.secao,
  ...classificar(m), fonte: m.fonte,
}));
// O recuo ↳ e a posição na mesma tabela identificam o escalpo-base.
// Deck Sináptico tem três versões comerciais consecutivas e módulos comuns.
const anteriores = new Map<string, typeof linhas>();
for (const linha of linhas) {
  if (linha.pagina !== "ESCALPOS") continue;
  const mercadoria = porId.get(linha.id)!;
  const tabela = mercadoria.fonte.tabelaBlocoId;
  if (!tabela) continue;
  const chaves = anteriores.get(tabela) ?? [];
  if (linha.subtipo_proposto === "modulo_escalpo") {
    const ultima = chaves.at(-1);
    if (!ultima) throw new Error(`Módulo sem implante-base anterior: ${linha.nome}`);
    const bases = ultima.nome === "Deck Sináptico Imperial"
      ? chaves.filter((b) => b.nome.startsWith("Deck Sináptico "))
      : [ultima];
    if (bases.length === 0) throw new Error(`Bases ausentes para ${linha.nome}`);
    linha.vinculos_sugeridos = {
      content_type: "escalpo", slugs: bases.map((b) => b.slug_sugerido),
      criterio: "recuo e sequência na tabela do Notion; compatibilidade a validar na regra",
    };
    continue;
  }
  if (linha.content_type_proposto === "escalpo" && !linha.nome.startsWith("RPI Forjado")) {
    chaves.push(linha);
    anteriores.set(tabela, chaves);
  }
}
if (linhas.filter((l) => l.subtipo_proposto === "modulo_escalpo" && l.vinculos_sugeridos?.slugs.length).length !== 48) {
  throw new Error("Nem todos os 48 módulos foram associados a um implante-base; revisar tabelas.");
}
const porSituacao = Object.fromEntries([...new Set(linhas.map((l) => l.situacao))].map((s) => [s, linhas.filter((l) => l.situacao === s).length]));
const porTipo = Object.fromEntries([...new Set(linhas.map((l) => l.content_type_proposto ?? "a_definir"))].map((t) => [t, linhas.filter((l) => (l.content_type_proposto ?? "a_definir") === t).length]));
const resultado = {
  _meta: {
    origem: "content/v12/db_mercadorias_v1_2_rascunho.json",
    total: linhas.length,
    aviso: "Classificação por estrutura e posição no Notion; não substitui revisão editorial, schema e validação de efeitos.",
  },
  por_situacao: porSituacao,
  por_content_type_proposto: porTipo,
  linhas,
};
await writeFile(resolve(raiz, "classificacao_mercadorias_v1_2_rascunho.json"), `${JSON.stringify(resultado, null, 2)}\n`);
console.log({ total: linhas.length, porSituacao, porTipo });
