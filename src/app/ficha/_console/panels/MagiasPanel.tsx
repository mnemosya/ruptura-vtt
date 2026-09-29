"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { applyRangeAreaMultiplierToText, checkSpellVertenteLevel, describeSpellManualEffects, getSpellAttackProfile, getSpellDamageEffect, getVertenteCd, getVertenteLevel, resolveSpellResistance, type SpellContent } from "../../../../lib/character";
import type { ConsoleApi } from "../types";
import { TextoComRegras } from "../TextoComRegras";
import { CabecalhoModulo } from "./CabecalhoModulo";

const VERTENTES = [
  ["cinetica", "Cinética"], ["energetica", "Energética"], ["material", "Material"],
  ["somatica", "Biótica"], ["sinaptica", "Sináptica"], ["cognitiva", "Cognitiva"],
] as const;
const rotulo = (id: string) => VERTENTES.find(([slug]) => slug === id)?.[1] ?? id;
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Só apresentação: custos, testes e persistência continuam nas ações da ficha. */
export function MagiasPanel({ api }: { api: ConsoleApi }) {
  const m = api.magias;
  const [vertente, setVertente] = useState("");
  const [nivel, setNivel] = useState(0);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const publicadas = m.spells.filter(s => s.status === "published");
  const repertorio = publicadas.filter(s => m.sheetMode === "evolucao" || m.magiasAprendidas.some(a => a.spellSlug === s.slug));
  const visiveis = repertorio.filter(s => (!vertente || s.vertente === vertente) && (!nivel || s.estatisticas.nivel === nivel) && normalizar(s.nome).includes(normalizar(busca)))
    .sort((a, b) => a.estatisticas.nivel - b.estatisticas.nivel || a.nome.localeCompare(b.nome, "pt-BR"));
  const spell = visiveis.find(s => s.slug === selecionado) ?? visiveis[0];
  const filtros = [["", "Todas"], ...VERTENTES, ...[...new Set(publicadas.map(s => s.vertente))].filter(v => !VERTENTES.some(([id]) => id === v)).map(v => [v, rotulo(v)])];
  return <section className="rc-eq-outer" aria-label="Magias">
    <div className="rc-eq-card-outer rc-inv-moldura">
      <CabecalhoModulo id="ID://MAGIAS" mod="MOD.ARC" />
      <div className="rc-inv rc-mag" data-testid="console-magias">
        <div className="rc-inv-abas rc-mag-abas" role="group" aria-label="Filtrar por vertente">
          {filtros.map(([id, label]) => <button key={id} type="button" className="rc-inv-aba" data-ativo={vertente === id || undefined} aria-pressed={vertente === id} onClick={() => setVertente(id)}>
            {label}<span className="rc-inv-aba-n">{repertorio.filter(s => !id || s.vertente === id).length}</span>
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
          <div className="rc-inv-detalhe">{spell ? <DetalheMagia key={spell.slug} spell={spell} publicadas={publicadas} api={api} /> : <p className="rc-inv-vazio">Selecione uma magia para ver os detalhes.</p>}</div>
        </div>}
      </div>
    </div>
  </section>;
}

function DetalheMagia({ spell, publicadas, api }: { spell: SpellContent; publicadas: SpellContent[]; api: ConsoleApi }) {
  const m = api.magias;
  const [fusao, setFusao] = useState("");
  const [mana, setMana] = useState(0);
  const aprendida = m.magiasAprendidas.find(a => a.spellSlug === spell.slug);
  const nivel = getVertenteLevel({ niveis_vertente: m.niveisVertente }, spell.vertente);
  const cd = nivel == null ? null : getVertenteCd(nivel);
  const bloqueada = checkSpellVertenteLevel(spell, { niveis_vertente: m.niveisVertente }).aboveLevel;
  const ataque = getSpellAttackProfile(spell);
  const dano = getSpellDamageEffect(spell);
  const resistencia = resolveSpellResistance(spell, nivel);
  const manuais = describeSpellManualEffects(spell);
  const mult = ataque.isAttack ? m.spellRangeAreaMultiplier ?? 1 : 1;
  const alcance = spell.estatisticas.alcanceTexto ? applyRangeAreaMultiplierToText(spell.estatisticas.alcanceTexto, mult) : null;
  const area = spell.estatisticas.areaTexto ? applyRangeAreaMultiplierToText(spell.estatisticas.areaTexto, mult) : null;
  const outras = publicadas.filter(s => s.slug !== spell.slug && m.magiasAprendidas.some(a => a.spellSlug === s.slug));
  const fundida = outras.find(s => s.slug === fusao);
  const bloqueiaFusao = bloqueada || !fundida || checkSpellVertenteLevel(fundida, { niveis_vertente: m.niveisVertente }).aboveLevel;
  const podeCanalizar = ataque.isAttack && m.canalizar?.available;
  const manaCanalizada = Math.min(mana, Math.max(0, m.canalizar?.manaAtual ?? 0));
  return <div className="rc-inv-det rc-mag-det" data-vertente={spell.vertente}>
    <div className="rc-mag-conteudo">
      <div className="rc-inv-det-cab"><div className="rc-inv-det-titulo"><h3>{spell.nome}</h3><div className="rc-inv-etiquetas"><span className="rc-inv-etiqueta">Nível {spell.estatisticas.nivel}</span><span className="rc-inv-etiqueta">{rotulo(spell.vertente)}</span>{spell.estatisticas.tipo_magia && <span className="rc-inv-etiqueta">{spell.estatisticas.tipo_magia}</span>}{aprendida && m.sheetMode === "evolucao" && <span className="rc-inv-etiqueta">Aprendida</span>}</div></div></div>
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
          <div className="rc-inv-linha"><dt>Nível da vertente</dt><dd>{m.sheetMode === "evolucao" ? <input aria-label={`Nível de ${rotulo(spell.vertente)}`} type="number" min={0} value={nivel ?? ""} placeholder="—" onChange={e => m.onSetVertenteLevel(spell.vertente, Math.max(0, Math.trunc(Number(e.target.value) || 0)))} /> : nivel ?? "Não definido"}</dd></div>
          <div className="rc-inv-linha"><dt>CD da vertente</dt><dd>{cd ?? "Nível não definido"}</dd></div>
          {spell.estatisticas.usa_reacao && <div className="rc-inv-linha"><dt>Reação</dt><dd>Sim</dd></div>}
        </dl>
      </div>
      {mult !== 1 && (alcance || area) && <p className="rc-inv-det-desc">Domínio Territorial: {alcance?.changed || area?.changed ? "alcance/área ampliados." : "confirme a distância manualmente."}{((alcance && !alcance.changed) || (area && !area.changed)) && " Há medidas que não puderam ser ampliadas automaticamente."}</p>}
      {spell.descricao_longa && <div className="rc-inv-efeito"><TextoComRegras texto={spell.descricao_longa} glossario={api.glossario} className="rc-inv-efeito-corpo rc-inv-det-desc" /></div>}
      {resistencia && <p className="rc-inv-det-desc">Resistência: {resistencia.acoes.join(" / ")} · {resistencia.cd != null ? `CD ${resistencia.cd}` : "CD não definida"}{resistencia.condicional ? " (condicional)" : ""}. Resolvida pelo alvo após conjurar.</p>}
      {manuais.map((texto, i) => <TextoComRegras key={i} texto={`Manual: ${texto}`} glossario={api.glossario} className="rc-inv-det-desc" />)}
      {bloqueada && <p className="rc-mag-aviso">Nível de vertente insuficiente para conjurar esta magia.</p>}
    </div>
    {/* Só leitura: conjurar, rolar dano e fundir são ações — o rodapé sai inteiro. */}
    {!api.somenteLeitura && <div className="rc-inv-det-rodape rc-mag-rodape">
      {m.sheetMode === "evolucao" ? <button type="button" className="rc-inv-btn" onClick={() => aprendida ? m.onForget(aprendida.id) : m.onLearn(spell.slug)}>{aprendida ? "Esquecer" : "Aprender"}</button> : <>
        <button type="button" className="rc-inv-btn rc-mag-conjurar" disabled={bloqueada || !aprendida} onClick={() => m.onCast(spell.slug)}>Conjurar</button>
        {dano && <details className="rc-mag-opcoes"><summary>Dano e canalização</summary><div className="rc-mag-opcoes-corpo">{podeCanalizar && <label>Canalizar Potencializar · Mana<input aria-label="Mana para canalizar" type="number" min={0} max={m.canalizar?.manaAtual ?? 0} value={manaCanalizada} onChange={e => setMana(Math.max(0, Math.min(m.canalizar?.manaAtual ?? 0, Math.trunc(Number(e.target.value) || 0))))} /></label>}<button type="button" className="rc-inv-btn" onClick={() => m.onRollDamage(spell.slug, podeCanalizar ? manaCanalizada : 0)}>{dano.dado ? `Rolar dano (${dano.dado})` : `Dano fixo (${dano.valor})`}{podeCanalizar && manaCanalizada > 0 ? ` +${manaCanalizada}` : ""}</button></div></details>}
        {outras.length > 0 && <details className="rc-mag-opcoes"><summary>Fusão · +1 Sobrecarga</summary><div className="rc-mag-opcoes-corpo"><select aria-label="Magia para fundir" value={fundida ? fusao : ""} onChange={e => setFusao(e.target.value)}><option value="">Escolher magia…</option>{outras.map(s => <option key={s.slug} value={s.slug}>{s.nome} ({rotulo(s.vertente)})</option>)}</select><button type="button" className="rc-inv-btn" disabled={bloqueiaFusao} onClick={() => { if (!bloqueiaFusao) { m.onCastWithFusion(spell.slug, fusao); setFusao(""); } }}>Conjurar com Fusão</button>{fundida && bloqueiaFusao && <p className="rc-mag-aviso">Nível de vertente insuficiente para esta fusão.</p>}</div></details>}
      </>}
    </div>}
  </div>;
}
