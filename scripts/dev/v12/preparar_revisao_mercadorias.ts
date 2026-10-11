/** Prepara uma revisão isolada; não escreve no Notion nem no Supabase.
 * node --import tsx scripts/dev/v12/preparar_revisao_mercadorias.ts <pasta> <copia-publicada.json>
 * A pasta deve conter fontes_notion/mercadorias.json, obtido do Notion atual.
 */
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { normalizeMarketTechnicalFields } from "../../../src/lib/character/marketTechnicalFields";
type Raw = Record<string, any>;
const root = resolve(process.argv[2] ?? "content/v12/revisao-2026-10-10");
if (!process.argv[3]) throw new Error("Informe uma cópia somente leitura do catálogo publicado.");
const published: Raw[] = JSON.parse(await readFile(resolve(process.argv[3]), "utf8"));
await readFile(join(root,"fontes_notion/mercadorias.json"),"utf8");
await mkdir(root,{recursive:true});
const work = await mkdtemp(join(tmpdir(),"market-review-"));
const replacements: Record<string,string> = { "../../../src/": resolve("src")+"/", "./notionTexto": resolve("scripts/dev/v12/notionTexto") };
for (const filename of ["gerar_mercadorias_do_mercado.ts","classificar_mercadorias_v12.ts","gerar_catalogo_mercadorias_v12.ts"]) {
  let code = await readFile(resolve("scripts/dev/v12",filename),"utf8");
  code = code.replace('const raiz = resolve("content/v12");', `const raiz = ${JSON.stringify(root)};`);
  for (const [from,to] of Object.entries(replacements)) code=code.replaceAll('from "'+from,'from "'+to);
  if (filename==="gerar_mercadorias_do_mercado.ts") {
    code=code.replace("por unidade|pelo conjunto|por região", "por unidade|pelo conjunto|por região|por kit");
  }
  if (filename==="classificar_mercadorias_v12.ts") {
    code=code.replace('case "DISPOSITIVOS TECNOLÓGICOS":','case "DISPOSITIVOS":\n    case "DISPOSITIVOS TECNOLÓGICOS":');
    code=code.replace('case "FERRAMENTAS E UTILIDADES":','case "FERRAMENTAS":\n    case "FERRAMENTAS E UTILIDADES":');
    code=code.replace('item("arma", m.secao[0] ?? null)', 'item("arma", m.secao.find(s => /^(ARMAS BRANCAS|ARMAS DE DISPARO|ARMAS DE FOGO|ARMAS DE ENERGIA)$/.test(s)) ?? m.secao[0] ?? null)');
    code=code.replace('especializado("rune", m.secao[0] ?? null)', 'especializado("rune", m.secao.find(s => s.startsWith("RUNAS PARA ")) ?? m.secao[0] ?? null)');
  }
  if (filename==="gerar_catalogo_mercadorias_v12.ts") {
    code=code.replace('const esperado = { item: 273, rune: 52, escalpo: 39, companion_model: 10 };', 'const esperado = Object.fromEntries(Object.entries(grupos).map(([tipo, rows]) => [tipo, rows.length]));');
    code=code.replace('function tipoRuna(m: Mercadoria): string | null {', `function tipoRuna(m: Mercadoria): string | null {
      const application = m.campos["Aplicação"]?.toLowerCase();
      if (application) return ({ "armas brancas": "corpo_a_corpo", "projéteis": "arremesso_disparo", "armas de fogo": "fogo", "armas de energia": "energia" } as Record<string,string>)[application] ?? null;`);
  }
  const file=join(work,filename.replace(".ts",".mts"));await writeFile(file,code);
  execFileSync(process.execPath,["--import",resolve("node_modules/tsx/dist/loader.mjs"),file],{stdio:"inherit",cwd:process.cwd()});
}
const manifest = {item:["db_mercado_itens_v1_2.json","itens"],rune:["db_mercado_runas_v1_2.json","runas"],escalpo:["db_mercado_escalpos_v1_2.json","escalpos"],companion_model:["db_mercado_companheiros_v1_2.json","modelos_companheiros"]};
const id=(v:unknown)=>typeof v==="string"?v.replaceAll("-",""):"";
const prior = new Map<string,Raw[]>();
for(const row of published){
 const source=id(row.payload?.fonte_notion?.linhaBlocoId);
 if(source){const k=row.content_type+":"+source;prior.set(k,[...(prior.get(k)??[]),row]);}
}
const warnings: Raw[]=[];const identities:Raw[]=[];const candidates:Raw[]=[];
const normalize=(s: unknown)=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replaceAll("_"," ").trim();
function scope(p: Raw) {
 const raw=normalize(p.restricao_subtipo??p.subtipo??p.dados_notion?.campos?.["Aplicação"]??p.dados_notion?.secao?.[0]);
 if (/corpo a corpo|brancas/.test(raw)) return "brancas";
 if (/arremesso|disparo|projeteis/.test(raw)) return "disparo";
 if (/fogo/.test(raw)) return "fogo";
 if (/energia/.test(raw)) return "energia";
 return raw;
}
for(const [type,[file,key]] of Object.entries(manifest)){
 const doc=JSON.parse(await readFile(join(root,file),"utf8"));
 for(const payload of doc[key] as Raw[]){
  const source=id(payload.fonte_notion?.linhaBlocoId);
  let matches=prior.get(type+":"+source)??[];
  let identityMethod="bloco_notion";
  if (!matches.length) {
    matches=published.filter(r=>r.content_type===type&&r.slug===payload.slug);
    identityMethod="slug_existente";
  }
  if (!matches.length) {
    matches=published.filter(r=>r.content_type===type&&r.payload.fonte_notion?.paginaNotionId===payload.fonte_notion?.paginaNotionId&&normalize(r.payload.nome)===normalize(payload.nome)&&scope(r.payload)===scope(payload));
    identityMethod="nome_e_aplicacao_na_mesma_pagina";
  }
  if (!matches.length && payload.categoria==="arma") {
    const code=/^([A-Z]+-\d+)\s/.exec(payload.nome)?.[1];
    const weaponType=/\(([^()]+)\)$/.exec(payload.nome)?.[1];
    if (code && weaponType) matches=published.filter(r=>r.content_type===type&&r.payload.categoria==="arma"&&r.payload.nome.startsWith(code+" ")&&/\(([^()]+)\)$/.exec(r.payload.nome)?.[1]===weaponType);
    identityMethod="codigo_do_modelo_e_tipo_da_arma";
  }
  if(matches.length>1){warnings.push({slug:payload.slug,motivo:"ID de origem com múltiplos registros publicados; identidade pendente."});continue;}
  const old=matches[0];
  if(old){
   identities.push({tipo:type,slug:old.slug,nomeAntes:old.payload.nome,nomeAtual:payload.nome,slugSugerido:payload.slug,fonte:source,criterio:identityMethod});
   payload.id=old.payload.id;payload.slug=old.slug;payload.created_at=old.payload.created_at;
   payload.estatisticas={...old.payload.estatisticas,...payload.estatisticas};
   if(old.payload.payload_automacao)payload.payload_automacao=old.payload.payload_automacao;
  }
  if(type==="item" && !old && payload.nome==="Aljava") payload.id=payload.slug="aljava";
  if(type==="item"){
   const normalized=normalizeMarketTechnicalFields(payload);Object.assign(payload,normalized.raw);
   normalized.warnings.forEach(motivo=>warnings.push({slug:payload.slug,motivo}));
  }
  const descriptor=/^\*(Muito comum|Comum|Incomum|Raro|Muito raro)\*/i.exec(payload.descricao_longa??"")?.[1];
  if (descriptor && normalize(descriptor)!==normalize(payload.raridade)) warnings.push({slug:payload.slug,motivo:"Raridade diverge entre tabela e verbete; revisar antes da publicação."});
  candidates.push({content_type:type,slug:payload.slug,payload});
 }
}
// Vinculações geradas pela organização nova devem apontar para slugs preservados.
const redirects=new Map(identities.map(r=>[r.slugSugerido,r.slug]));
for(const r of candidates)if(r.payload.vinculos_sugeridos?.slugs)r.payload.vinculos_sugeridos.slugs=r.payload.vinculos_sugeridos.slugs.map((s:string)=>redirects.get(s)??s);
// Liga munições por compatibilidade canônica, mantendo as identidades publicadas.
const weapons=candidates.filter(r=>r.content_type==="item" && r.payload.categoria==="arma");
const fold=(s:string)=>normalize(s).replace(/[()]/g, "");
// Decisão provisória do usuário (2026-10-11): Wrecker usa munição de precisão.
const temporaryPrecisionWeapons = new Set(["armas_as_127_wrecker_rifle_antimaterial"]);
const ammoFamilies: Record<string,string> = {pistola:"mun_pistola",fuzil:"mun_fuzil",escopeta:"mun_escopeta",precisao:"mun_precisao"};
for(const r of candidates.filter(r=>r.payload.categoria==="municao")) {
 const p=r.payload, f=p.dados_notion.campos;
 const family = f["Célula"] ? "celula_energia_" + p.estatisticas.cargas_max
   : f.Flecha ? "flecha_especial" : f.Tipo === "Flecha simples" ? "flecha_simples"
   : f.Tipo === "Virotes" ? "virotes" : ammoFamilies[normalize(f["Munição"])];
 if (!family) throw new Error("Família de munição sem correspondência: "+p.nome);
 const accepted=weapons.filter(w=>{
   const q=w.payload, sf=q.dados_notion.secao.join(" ");
   if (family.startsWith("celula_energia_")) return sf.includes("ARMAS DE ENERGIA") && q.estatisticas.municao_max === p.estatisticas.cargas_max;
   if (family.startsWith("flecha")) return /\(arco |^arco /i.test(q.nome);
   if (family === "virotes") return /\(besta |^besta /i.test(q.nome);
   const type=/\(([^()]+)\)$/.exec(q.nome)?.[1] ?? q.nome;
   return (family==="mun_pistola" && /pistola|revólver/i.test(type)) || (family==="mun_fuzil" && /submetralhadora|carabina|rifle de assalto|metralhadora/i.test(type)) || (family==="mun_escopeta" && /escopeta|espingarda/i.test(type)) || (family==="mun_precisao" && (/rifle de precisão/i.test(type) || temporaryPrecisionWeapons.has(w.slug)));
 });
 p.estatisticas.compatibilidade={familia:family,itens:accepted.map(w=>w.slug)};
 for(const w of accepted) {
   if (family === "flecha_especial") continue;
   const f=w.payload.dados_notion.campos;
   const n=Number(/^\d+/.exec(f["Munição"] ?? f.Cargas ?? "")?.[0]);
   if (n>0) {w.payload.estatisticas.municao_max=n;w.payload.estatisticas.municao_compativel=family;}
 }
}
for(const w of weapons) {
 const p=w.payload;
 const fields=p.dados_notion.campos;
 const capacity=Number(/^\d+/.exec(fields["Munição"] ?? fields.Cargas ?? "")?.[0]);
 if (capacity > 0 && !p.estatisticas.municao_max) {p.estatisticas.municao_max=capacity;warnings.push({slug:p.slug,motivo:"Capacidade declarada; tipo de munição compatível não especificado no catálogo canônico."});}
 if (p.estatisticas.kit && p.estatisticas.propriedades?.includes("arremesso")) p.estatisticas.pericia_teste="precisao";
 if (p.estatisticas.modos_ataque?.length) {
   const first=p.estatisticas.modos_ataque[0];
   p.estatisticas.dado_dano=first.dado_dano;p.estatisticas.tipo_dano=first.tipo_dano;p.estatisticas.subtipo_dano=first.subtipo_dano;p.estatisticas.soma_atributo=first.soma_atributo;
 }
}
for(const w of warnings.filter(w=>w.slug==="armas_facas_de_arremesso")) {
 if(weapons.find(r=>r.slug===w.slug)?.payload.estatisticas.modos_ataque?.length===2) warnings.splice(warnings.indexOf(w),1);
}
const missing=published.filter(r=>!candidates.some(c=>c.content_type===r.content_type&&c.slug===r.slug));
const keys=candidates.map(r=>r.content_type+":"+r.slug);
if(new Set(keys).size!==keys.length)throw new Error("Colisão de identidades na revisão; publicação bloqueada.");
const newRows=candidates.filter(c=>!published.some(r=>r.content_type===c.content_type&&r.slug===c.slug));
const report={somente_revisao:true,publicacao_automatica:false,extraidoEm:JSON.parse(await readFile(join(root,"fontes_notion/mercadorias.json"),"utf8")).extraidoEm,identidades_preservadas:identities,novos:newRows.map(r=>({tipo:r.content_type,slug:r.slug,nome:r.payload.nome})),ausentes_na_fonte_atual:missing.map(r=>({tipo:r.content_type,slug:r.slug,nome:r.payload.nome})),avisos:warnings};
await writeFile(join(root,"catalogo-candidato.json"),JSON.stringify({meta:{somente_revisao:true},registros:candidates},null,2)+"\n");
await writeFile(join(root,"diff-revisao.json"),JSON.stringify(report,null,2)+"\n");
console.log({candidatos:candidates.length,preservados:identities.length,novos:newRows.length,ausentes:missing.length,avisos:warnings.length});
