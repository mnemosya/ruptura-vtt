"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { SURTO_DE_ENERGIA, canonicalVertenteId, checkSpellVertenteLevel, describeSpellManualEffects, getSpellAttackProfile, getSpellCostChoice, getSpellDamageEffect, getSpellHealEffect, separarTabelaDeNiveis, getVertenteCd, getVertenteLevel, resolveSpellResistance, type SpellContent } from "../../../../lib/character";
import type { ConsoleApi } from "../types";
import { TextoComRegras } from "../TextoComRegras";
import { CabecalhoModulo } from "./CabecalhoModulo";
import { MagiasHud, type MagiaHud } from "./hud/MagiasHud";
import { CatalogoMagiasHud } from "./hud/CatalogoMagiasHud";
import { JanelaMercado } from "./hud/JanelaMercado";

const VERTENTES = [
  ["cinetica", "Cinética"], ["energetica", "Energética"], ["material", "Material"],
  ["biotica", "Biótica"], ["sinaptica", "Sináptica"], ["cognitiva", "Cognitiva"],
] as const;
const rotulo = (id: string) => VERTENTES.find(([slug]) => slug === canonicalVertenteId(id))?.[1] ?? id;
/**
 * A `descricao_longa` do catálogo v1.2 começa repetindo a `descricao_curta`
 * inteira (o importador do Notion grava o 1º parágrafo nas duas). Aqui o
 * efeito mostra só o que vem depois; sem nada além, não há efeito à parte.
 */
function efeitoSemRepetir(s: SpellContent): string | null {
  const longa = s.descricao_longa?.trim() ?? "", curta = s.descricao_curta?.trim() ?? "";
  if (!longa) return null;
  if (!curta || !longa.startsWith(curta)) return longa;
  return longa.slice(curta.length).trim() || null;
}
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Só apresentação: custos, testes e persistência continuam nas ações da ficha. */
/**
 * Modo Evolução vale para magias só em personagens v1: na v1.2 as magias
 * e os níveis de Vertente vêm do avanço de Ranking (o Modo Evolução ali
 * só corrige Atributos e Perícias).
 */
function evolucaoDeMagias(api: ConsoleApi): boolean {
  return api.magias.sheetMode === "evolucao" && (api.character as { schema_version?: number }).schema_version !== 2;
}

/**
 * Em jogo, a aba é o HUD do protótipo (`hud/MagiasHud.tsx`): anel das
 * vertentes, grimório por nível e leitura em modal. A lista antiga
 * fica para o Modo Evolução v1 (aprender/esquecer) e para o catálogo
 * indisponível, que o HUD não trata.
 */
export function MagiasPanel({ api }: { api: ConsoleApi }) {
  const m = api.magias;
  if (!evolucaoDeMagias(api) && !m.catalogError) return <MagiasEmJogo api={api} />;
  return <MagiasLista api={api} />;
}

function MagiasEmJogo({ api }: { api: ConsoleApi }) {
  const m = api.magias;
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  const aprendidas = m.spells.filter((s) => s.status === "published" && m.magiasAprendidas.some((a) => a.spellSlug === s.slug));
  const nivelDe = (vertente: string) => getVertenteLevel({ niveis_vertente: m.niveisVertente }, vertente);
  const paraHud = (s: SpellContent): MagiaHud => {
    const dano = getSpellDamageEffect(s);
    const cura = getSpellHealEffect(s);
    /* Tabela de níveis vira o seletor do HUD; o texto em volta segue como efeito antes/depois dela. */
    const efeitoComEscolha = (spell: SpellContent): Pick<MagiaHud, "efeito" | "efeitoDepois" | "escolha"> => {
      const texto = efeitoSemRepetir(spell);
      const no = (t: string) => (t ? <TextoComRegras texto={t} glossario={api.glossario} /> : null);
      const escolha = getSpellCostChoice(spell);
      if (escolha?.tipo === "valor") return { efeito: no(texto ?? ""), escolha };
      const separada = escolha && texto ? separarTabelaDeNiveis(texto) : null;
      if (escolha?.tipo !== "nivel" || !separada) return { efeito: no(texto ?? "") };
      const teto = nivelDe(spell.vertente);
      return {
        efeito: no(separada.antes),
        efeitoDepois: no(separada.depois),
        escolha: { tipo: "nivel", colunas: escolha.tabela.colunas, linhas: escolha.tabela.linhas.map((l) => ({ nivel: l.nivel, celulas: l.celulas, mana: l.mana ?? 0, bloqueada: teto != null && l.nivel > teto })) },
      };
    };
    const res = resolveSpellResistance(s, nivelDe(s.vertente));
    return {
      slug: s.slug,
      nome: s.nome,
      vertente: canonicalVertenteId(s.vertente),
      nivel: s.estatisticas.nivel,
      tipo: s.estatisticas.tipo_magia ?? "",
      mana: s.estatisticas.custo_mana,
      pa: s.estatisticas.custo_pa,
      alcance: s.estatisticas.alcanceTexto ?? null,
      area: s.estatisticas.areaTexto ?? null,
      duracao: s.estatisticas.duracaoTexto ?? null,
      preRequisito: s.estatisticas.preRequisito ?? null,
      escolhasConjuracao: s.estatisticas.escolhasConjuracao?.map((e) => ({ id: e.id, rotulo: e.rotulo, opcoes: e.opcoes.map((o) => ({ id: o.id, nome: o.nome, resumo: o.resumo })) })),
      /* sem custo em PA e com conjuração em texto (tempo, reação): mostra isso no lugar do "0 PA" */
      conjuracao: s.estatisticas.custo_pa === 0 && s.estatisticas.conjuracaoTexto && !/\bPA$/i.test(s.estatisticas.conjuracaoTexto) ? s.estatisticas.conjuracaoTexto : null,
      reacao: !!s.estatisticas.usa_reacao,
      descricao: s.descricao_curta ? <TextoComRegras texto={s.descricao_curta} glossario={api.glossario} /> : null,
      ...efeitoComEscolha(s),
      dano: dano ? String(dano.dado ?? dano.valor) : null,
      cura: cura ? String(cura.dado ?? cura.valor) : null,
      curaPe: cura?.recurso === "pe",
      resistencia: res ? `${res.acoes.join(" / ")} · ${res.cd != null ? `CD ${res.cd}` : "CD não definida"}${res.condicional ? " (condicional)" : ""}` : null,
      manuais: describeSpellManualEffects(s).map((t, i) => <TextoComRegras key={i} texto={`Manual: ${t}`} glossario={api.glossario} />),
      bloqueada: checkSpellVertenteLevel(s, { niveis_vertente: m.niveisVertente }).aboveLevel,
    };
  };
  const magias = aprendidas.map(paraHud);
  const catalogo = m.spells.filter(s => s.status === "published").map(paraHud);
  const niveis = Object.fromEntries(VERTENTES.map(([id]) => [id, nivelDe(id)]));
  /* Mana temporária (Surto de Energia) também paga a conjuração — `castSpell` drena ela primeiro. */
  const recursos = api.character.recursos_atuais;
  const mana = { atual: (recursos?.mana ?? 0) + (recursos?.mana_temporaria ?? 0), max: api.derivados.mana_max ?? 0 };
  const vp = (api.character as { magia?: { vertente_primaria?: string } }).magia?.vertente_primaria;
  const primaria = vp ? canonicalVertenteId(vp) : null;
  return <section className="rc-eq-outer" aria-label="Magias">
    <div className="rc-eq-card-outer rc-inv-moldura">
      <CabecalhoModulo id="ID://MAGIAS" mod="MOD.ARC // 07" />
      <div className="rc-inv" data-testid="console-magias">
        <MagiasHud
          magias={magias}
          niveis={niveis}
          primaria={primaria}
          mana={mana}
          somenteLeitura={api.somenteLeitura}
          onConjurar={m.onCast}
          onRolarDano={m.onRollDamage}
          onRolarCura={m.onRollHeal}
          onAbrirCatalogo={() => setCatalogoAberto(true)}
          onSurtoDeEnergia={api.podeUsarSobrecarga ? () => api.usarSobrecarga(SURTO_DE_ENERGIA) : undefined}
          vazio="Nenhuma magia aprendida. Abra o catálogo para aprender magias."
        />
      </div>
    </div>
    {catalogoAberto && <JanelaMercado titulo="Catálogo de magias" onFechar={() => setCatalogoAberto(false)}>
      {fechar => <CatalogoMagiasHud magias={catalogo} aprendidas={new Set(m.magiasAprendidas.map(a => a.spellSlug))}
        niveis={niveis} mana={mana}
        somenteLeitura={api.somenteLeitura} onAprender={m.onLearn} onFechar={fechar} />}
    </JanelaMercado>}
  </section>;
}

function MagiasLista({ api }: { api: ConsoleApi }) {
  const m = api.magias;
  const evolucao = evolucaoDeMagias(api);
  const [vertente, setVertente] = useState("");
  const [nivel, setNivel] = useState(0);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const publicadas = m.spells.filter(s => s.status === "published");
  const repertorio = publicadas.filter(s => evolucao || m.magiasAprendidas.some(a => a.spellSlug === s.slug));
  const visiveis = repertorio.filter(s => (!vertente || canonicalVertenteId(s.vertente) === vertente) && (!nivel || s.estatisticas.nivel === nivel) && normalizar(s.nome).includes(normalizar(busca)))
    .sort((a, b) => a.estatisticas.nivel - b.estatisticas.nivel || a.nome.localeCompare(b.nome, "pt-BR"));
  const spell = visiveis.find(s => s.slug === selecionado) ?? visiveis[0];
  const filtros = [["", "Todas"], ...VERTENTES, ...[...new Set(publicadas.map(s => canonicalVertenteId(s.vertente)))].filter(v => !VERTENTES.some(([id]) => id === v)).map(v => [v, rotulo(v)])];
  return <section className="rc-eq-outer" aria-label="Magias">
    <div className="rc-eq-card-outer rc-inv-moldura">
      <CabecalhoModulo id="ID://MAGIAS" mod="MOD.ARC" />
      <div className="rc-inv rc-mag" data-testid="console-magias">
        <div className="rc-inv-abas rc-mag-abas" role="group" aria-label="Filtrar por vertente">
          {filtros.map(([id, label]) => <button key={id} type="button" className="rc-inv-aba" data-ativo={vertente === id || undefined} aria-pressed={vertente === id} onClick={() => setVertente(id)}>
            {label}<span className="rc-inv-aba-n">{repertorio.filter(s => !id || canonicalVertenteId(s.vertente) === id).length}</span>
          </button>)}
        </div>
        {m.catalogError ? <p className="rc-inv-vazio" role="alert">Catálogo de magias indisponível. Tente novamente mais tarde.</p> : <div className="rc-inv-corpo">
          <div className="rc-inv-lista">
            <div className="rc-inv-busca-linha"><label className="rc-inv-busca"><Search size={14} aria-hidden="true" /><input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar magia..." aria-label="Buscar magia" /></label></div>
            <div className="rc-mag-niveis" role="group" aria-label="Filtrar por nível"><span>Nível</span>{[0, 1, 2, 3, 4, 5].map(n => <button type="button" key={n} className="rc-inv-aba" aria-pressed={nivel === n} data-ativo={nivel === n || undefined} onClick={() => setNivel(n)}>{n || "Todos"}</button>)}</div>
            <div className="rc-inv-rolo"><div className="rc-inv-grade rc-mag-grade">
              {visiveis.map(s => <button key={s.slug} type="button" className="rc-inv-card" data-vertente={s.vertente} aria-pressed={spell?.slug === s.slug} onClick={() => setSelecionado(s.slug)}>
                <span className="rc-inv-card-face"><span className="rc-inv-card-nome">{s.nome}</span><span className="rc-inv-card-footer"><span className="rc-inv-card-cat"><span className="rc-inv-card-espacos" aria-hidden="true"><i /></span>{rotulo(s.vertente)}</span><span className="rc-inv-qtd"><small>NV.</small>{s.estatisticas.nivel}</span></span></span>
              </button>)}
              {!visiveis.length && <p className="rc-inv-vazio">{repertorio.length ? "Nenhuma magia corresponde aos filtros." : "Nenhuma magia aprendida. Aprenda magias no Modo Evolução."}</p>}
            </div></div>
          </div>
          <div className="rc-inv-detalhe">{spell ? <DetalheMagia key={spell.slug} spell={spell} api={api} /> : <p className="rc-inv-vazio">Selecione uma magia para ver os detalhes.</p>}</div>
        </div>}
      </div>
    </div>
  </section>;
}

function DetalheMagia({ spell, api }: { spell: SpellContent; api: ConsoleApi }) {
  const m = api.magias;
  const evolucao = evolucaoDeMagias(api);
  const aprendida = m.magiasAprendidas.find(a => a.spellSlug === spell.slug);
  const nivel = getVertenteLevel({ niveis_vertente: m.niveisVertente }, spell.vertente);
  const cd = nivel == null ? null : getVertenteCd(nivel);
  const bloqueada = checkSpellVertenteLevel(spell, { niveis_vertente: m.niveisVertente }).aboveLevel;
  const ataque = getSpellAttackProfile(spell);
  const dano = getSpellDamageEffect(spell);
  const resistencia = resolveSpellResistance(spell, nivel);
  const manuais = describeSpellManualEffects(spell);
  const alcance = spell.estatisticas.alcanceTexto ? { text: spell.estatisticas.alcanceTexto } : null;
  const area = spell.estatisticas.areaTexto ? { text: spell.estatisticas.areaTexto } : null;
  return <div className="rc-inv-det rc-mag-det" data-vertente={spell.vertente}>
    <div className="rc-mag-conteudo">
      <div className="rc-inv-det-cab"><div className="rc-inv-det-titulo"><h3>{spell.nome}</h3><div className="rc-inv-etiquetas"><span className="rc-inv-etiqueta">Nível {spell.estatisticas.nivel}</span><span className="rc-inv-etiqueta">{rotulo(spell.vertente)}</span>{spell.estatisticas.tipo_magia && <span className="rc-inv-etiqueta">{spell.estatisticas.tipo_magia}</span>}{aprendida && evolucao && <span className="rc-inv-etiqueta">Aprendida</span>}</div></div></div>
      {spell.descricao_curta && <TextoComRegras texto={spell.descricao_curta} glossario={api.glossario} className="rc-inv-det-desc" />}
      <div className="rc-inv-det-blocos">
        <div className="rc-inv-destaque">
          {dano && <div className="rc-inv-destaque-principal"><span className="rc-inv-rot">Dano</span><span className="rc-inv-val">{dano.dado ?? dano.valor}</span></div>}
          <div className="rc-inv-destaque-lado"><div className="rc-inv-mini"><span className="rc-inv-rot">Mana</span><span className="rc-inv-val">{spell.estatisticas.custo_mana ?? "Não definido"}</span></div><div className="rc-inv-mini"><span className="rc-inv-rot">PA</span><span className="rc-inv-val">{spell.estatisticas.custo_pa}</span></div></div>
        </div>
        <dl className="rc-inv-linhas">
          {alcance && <div className="rc-inv-linha"><dt>Alcance</dt><dd>{alcance.text}</dd></div>}
          {area && <div className="rc-inv-linha"><dt>Área</dt><dd>{area.text}</dd></div>}
          {spell.estatisticas.duracaoTexto && <div className="rc-inv-linha"><dt>Duração</dt><dd>{spell.estatisticas.duracaoTexto}</dd></div>}
          {spell.estatisticas.preRequisito && <div className="rc-inv-linha"><dt>Pré-requisito</dt><dd>{spell.estatisticas.preRequisito}</dd></div>}
          <div className="rc-inv-linha"><dt>Nível da vertente</dt><dd>{evolucao ? <input aria-label={`Nível de ${rotulo(spell.vertente)}`} type="number" min={0} value={nivel ?? ""} placeholder="—" onChange={e => m.onSetVertenteLevel(canonicalVertenteId(spell.vertente), Math.max(0, Math.trunc(Number(e.target.value) || 0)))} /> : nivel ?? "Não definido"}</dd></div>
          <div className="rc-inv-linha"><dt>CD da vertente</dt><dd>{cd ?? "Nível não definido"}</dd></div>
          {spell.estatisticas.usa_reacao && <div className="rc-inv-linha"><dt>Reação</dt><dd>Sim</dd></div>}
        </dl>
      </div>
      {efeitoSemRepetir(spell) && <div className="rc-inv-efeito"><TextoComRegras texto={efeitoSemRepetir(spell)!} glossario={api.glossario} className="rc-inv-efeito-corpo rc-inv-det-desc" /></div>}
      {resistencia && <p className="rc-inv-det-desc">Resistência: {resistencia.acoes.join(" / ")} · {resistencia.cd != null ? `CD ${resistencia.cd}` : "CD não definida"}{resistencia.condicional ? " (condicional)" : ""}. Resolvida pelo alvo após conjurar.</p>}
      {manuais.map((texto, i) => <TextoComRegras key={i} texto={`Manual: ${texto}`} glossario={api.glossario} className="rc-inv-det-desc" />)}
      {bloqueada && <p className="rc-mag-aviso">Nível de vertente insuficiente para conjurar esta magia.</p>}
    </div>
    {/* Só leitura: conjurar e rolar dano são ações — o rodapé sai inteiro. */}
    {!api.somenteLeitura && <div className="rc-inv-det-rodape rc-mag-rodape">
      {evolucao ? <button type="button" className="rc-inv-btn" onClick={() => aprendida ? m.onForget(aprendida.id) : m.onLearn(spell.slug)}>{aprendida ? "Esquecer" : "Aprender"}</button> : <>
        <button type="button" className="rc-inv-btn rc-mag-conjurar" disabled={bloqueada || !aprendida} onClick={() => m.onCast(spell.slug)}>Conjurar</button>
        {dano && <details className="rc-mag-opcoes"><summary>Dano</summary><div className="rc-mag-opcoes-corpo"><button type="button" className="rc-inv-btn" onClick={() => m.onRollDamage(spell.slug)}>{dano.dado ? `Rolar dano (${dano.dado})` : `Dano fixo (${dano.valor})`}</button></div></details>}
      </>}
    </div>}
  </div>;
}
