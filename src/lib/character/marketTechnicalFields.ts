/** Tradução conservadora de células do Notion. Não interpreta efeitos narrativos. */
type Raw = Record<string, unknown>;
const record = (v: unknown): Raw => v && typeof v === "object" && !Array.isArray(v) ? v as Raw : {};
const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const integer = (v: unknown): number | undefined => typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : undefined;

export function normalizeMarketTechnicalFields(raw: Raw): { raw: Raw; warnings: string[] } {
  const stats = { ...record(raw.estatisticas) };
  const notion = record(raw.dados_notion);
  const fields = Object.fromEntries(Object.entries({ ...record(notion.campos), ...record(stats.campos_tabela) }).map(([k,v]) => [key(k),v]));
  const next = { ...raw, estatisticas: stats };
  const warnings: string[] = [];
  const set = (k: string, v: unknown, target = stats) => {
    if (v === undefined) return;
    if (target[k] !== undefined && target[k] !== null) {
      if (JSON.stringify(target[k]) !== JSON.stringify(v)) warnings.push(`Conflito em ${k}: campo técnico preservado; revisar tabela.`);
    } else target[k] = v;
  };
  if (raw.categoria === "armadura") {
    const region = fields.regiao;
    if (typeof region === "string") {
      const values = key(region).split(/\s*,\s*|\s+e\s+/);
      const known = ["cabeca", "tronco", "bracos", "pernas"];
      const description = typeof raw.descricao_longa === "string" ? raw.descricao_longa : "";
      const declared = /Regi[aã]o:\*{0,2}\s*([^\n]+)/i.exec(description)?.[1];
      const detailedValues = declared ? key(declared.replaceAll("*", "")).split(/\s*,\s*|\s+e\s+/) : [];
      const conflict = detailedValues.length > 0 && detailedValues.every(v => known.includes(v)) && [...values].sort().join() !== [...detailedValues].sort().join();
      if (conflict) warnings.push("Região diverge entre tabela e verbete; campo não inferido.");
      else if (values.length && values.every(v => known.includes(v))) set("regioes", values);
      else warnings.push(`Região não reconhecida: ${region}`);
    }
    set("mit_base", integer(fields.mit));
  }
  if (raw.categoria === "armadura") {
    const sections = Array.isArray(notion.secao) ? notion.secao as string[] : [];
    const size = sections.map(key).find(v => /armaduras (leves|medias|pesadas)/.test(v));
    if (size) set("classe_armadura", size.includes("leves") ? "leve" : size.includes("medias") ? "media" : "pesada");
  }
  if (raw.categoria === "traje" && typeof fields.compatibilidade === "string") {
    const compatibility=key(fields.compatibilidade);
    set("compatibilidade_armadura", ["leve","media","pesada"].filter(c => compatibility.includes(c)));
  }
  if (raw.categoria === "escudo") set("pd_max", integer(fields.pd));
  if (raw.categoria === "armadura" || raw.categoria === "escudo") {
    const resistance = typeof fields.resistencia === "string" ? key(fields.resistencia) : "";
    const types: Record<string,string> = { fisico: "fisica", energetico: "energetica", hibrido: "hibrida" };
    set("tipo_protecao", types[resistance]);
    if (resistance && !types[resistance]) warnings.push(`Resistência não reconhecida: ${resistance}`);
  }
  const hidden = typeof fields["ocultavel?"] === "string" ? key(fields["ocultavel?"]) : "";
  if (["sim","nao","parcial"].includes(hidden)) set("ocultavel", hidden, next);
  if (raw.categoria === "arma" && typeof fields.dano === "string") {
    const damage = key(fields.dano).replace(/\s*\/\s*|\s+ou\s+/g, "/");
    const match = /^(?:(Corpo)\s*\+\s*)?(\d+d\d+)(?:\s+(cortante|perfurante|contundente|igneo|gelido|eletrico)(?:\/(cortante|perfurante|contundente))?)?$/i.exec(damage);
    if (match) {
      set("dado_dano", match[2].toLowerCase());
      if (match[1]) set("soma_atributo", "corpo");
      const tableType = typeof fields.tipo === "string" ? key(fields.tipo) : "";
      const subtype = match[3] ?? (["cortante","perfurante","contundente","igneo","gelido","eletrico"].includes(tableType) ? tableType : undefined);
      if (subtype) {
        set("tipo_dano", ["igneo","gelido","eletrico"].includes(subtype) ? "energetico" : "fisico");
        if (match[4]) set("subtipos_dano_possiveis", [match[3].toLowerCase(), match[4].toLowerCase()]);
        else set("subtipo_dano", subtype.toLowerCase());
      }
    } else warnings.push(`Dano requer tradução: ${fields.dano}`);
    set("maos", integer(fields.maos));
    if (typeof fields.propriedades === "string") {
      const known = new Set(["alcance", "aparar", "arremesso", "atordoamento", "congelamento", "ofuscamento", "disrupcao", "contusao", "desarme", "dispersao", "empurrao", "perfuracao", "precisao", "queimadura", "rajada", "sangramento", "silencioso"]);
      const parsed: string[] = [];
      for (const value of fields.propriedades.split(",").map(v => key(v)).filter(Boolean)) {
        const burst = /^rajada\s*\((\d+)\)$/.exec(value);
        const property = burst ? "rajada" : value;
        if (known.has(property)) {
          parsed.push(property);
          if (burst) set("rajada_x", Number(burst[1]));
        } else warnings.push(`Propriedade sem contrato mecânico: ${value}`);
      }
      if (parsed.length) set("propriedades", [...new Set(parsed)]);
    }
  }
  set("espacos_texto", fields.espacos);
  // Munição/cargas de armas exige resolver o item compatível e modo de recarga.
  // Nunca ativar automaticamente um carregador a partir de um número isolado.
  if (raw.categoria !== "arma") set("cargas_max", integer(fields.cargas));
  if (raw.categoria === "municao" || raw.categoria === "arma") {
    const description = typeof raw.descricao_longa === "string" ? raw.descricao_longa : "";
    set("kit", fields.kit ?? /\*\*Kit:\*\*\s*([^\n]+)/i.exec(description)?.[1]);
  }
  if (raw.categoria === "arma") {
    const description = typeof raw.descricao_longa === "string" ? raw.descricao_longa : "";
    const declared = (name: string) => new RegExp("\\*\\*" + name + ":\\*\\*\\s*([^\\n]+)", "i").exec(description)?.[1];
    set("maos", integer(declared("Mãos")));
    const sections = Array.isArray(notion.secao) ? notion.secao as string[] : [];
    const family = sections.map(key).find(v => /^(armas brancas|armas de disparo|armas de fogo|armas de energia)$/.test(v));
    const skills: Record<string,string> = { "armas brancas": "luta", "armas de disparo": "precisao", "armas de fogo": "balistica", "armas de energia": "balistica" };
    if (family) set("pericia_teste", skills[family]);
    const size = sections.map(key).find(v => /armas (leves|medias|pesadas)/.test(v));
    if (size) set("slots_runa_max", size.includes("leves") ? 1 : size.includes("medias") ? 2 : 3);
    if (family === "armas de fogo") { set("tipo_dano", "fisico"); set("subtipo_dano", "perfurante"); }
    const range = declared("Alcance");
    const ranged = range && /^(\d+) m eficaz, até (\d+) m com [–−-](\d+)/i.exec(range);
    if (ranged) set("alcance", { tipo: "distancia", eficaz_m: Number(ranged[1]), max_m: Number(ranged[2]), penalidade_alem_eficaz: -Number(ranged[3]) });
    if (!range && family === "armas brancas") set("alcance", {tipo:"adjacente",estendido_m: stats.propriedades && (stats.propriedades as string[]).includes("alcance") ? 2 : 1});
    const included=/\((\d+\s+(?:flechas simples|virotes)) inclus[oa]s?\)/i.exec(description)?.[1];
    if (included) set("inclui_na_compra", included);
    const modes = typeof fields.dano === "string" ? fields.dano.split(";").map(part => /Corpo\s*\+\s*(\d+d\d+)\s+perfurante\s*\((arremesso|corpo a corpo)\)/i.exec(part)) : [];
    if (modes.length === 2 && modes.every(Boolean)) set("modos_ataque", modes.map(m => ({ id: m![2] === "arremesso" ? "arremesso" : "corpo_a_corpo", dado_dano: m![1], tipo_dano: "fisico", subtipo_dano: "perfurante", soma_atributo: "corpo", pericia_teste: m![2] === "arremesso" ? "precisao" : "luta" })));
    const ammo = declared("Munição") ?? declared("Cargas");
    const capacity = integer(fields.municao ?? fields.cargas) ?? (ammo ? Number(/^(\d+)/.exec(ammo)?.[1]) : undefined);
    const text = key(ammo ?? "");
    let compatible: string | undefined;
    if (family === "armas de energia") compatible = "celula_energia";
    else if (/virote/.test(text)) compatible = "virotes";
    else if (/flecha/.test(text)) compatible = "flecha_simples";
    else if (/pistola/.test(text)) compatible = "mun_pistola";
    else if (/escopeta/.test(text)) compatible = "mun_escopeta";
    else if (/precisao/.test(text)) compatible = "mun_precisao";
    else if (/fuzil/.test(text)) compatible = "mun_fuzil";
    if (compatible && capacity && Number.isFinite(capacity)) { set("municao_max", capacity); set("municao_compativel", compatible); }
  }
  if (raw.categoria === "mobilidade" && typeof fields.tipo === "string") {
    const positions: Record<string,string> = {"estrutura dorsal":"estrutura_dorsal",luvas:"luvas",locomocao:"locomocao"};
    set("posicao_mobilidade",positions[key(fields.tipo)]);
  }
  // Suportes comerciais explicitamente definidos no catálogo atual.
  const name = key(String(raw.nome ?? ""));
  if (["aljava", "aljava autoalimentadora", "cartucheira"].includes(name)) set("suporte_municao", { tipo: name === "cartucheira" ? "cartucheira" : "aljava", capacidade: name === "cartucheira" ? 40 : 20, autoalimentadora: name === "aljava autoalimentadora" });
  return { raw: next, warnings };
}
