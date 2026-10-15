"use client";

import { useEffect, useRef, useState } from "react";
import { Fingerprint, Pencil, Save, ShieldCheck, UserRound, X } from "lucide-react";
import { REGIOES_V12, regiaoValida } from "../../../../lib/rulesetV12/contracts";
import type { CharacterV2, ClassContentV12, SubclassContentV12, RankingV12 } from "../../../../lib/rulesetV12/contracts";
import { readIdentityDossier, type IdentityDossier } from "../../../../lib/character/identity";
import { reached } from "../../../../lib/character/classManagement";
import type { ConsoleApi } from "../types";
import { AvancoChip } from "./ModoEvolucao";
import { CabecalhoModulo } from "./CabecalhoModulo";
import { CartaoListaHud } from "./hud/CartaoListaHud";
import { JanelaMercado } from "./hud/JanelaMercado";
import { oxanium } from "../../../_design/oxanium";
import ancora from "../../../../../content/v12/db_classe_ancora_v1_2.json";
import cacador from "../../../../../content/v12/db_classe_cacador_v1_2.json";
import combatente from "../../../../../content/v12/db_classe_combatente_v1_2.json";
import face from "../../../../../content/v12/db_classe_face_v1_2.json";
import infiltrador from "../../../../../content/v12/db_classe_infiltrador_v1_2.json";
import tecnico from "../../../../../content/v12/db_classe_tecnico_v1_2.json";
import vanguarda from "../../../../../content/v12/db_classe_vanguarda_v1_2.json";
import trajetorias from "../../../../../content/v12/db_trajetoria_v1_2.json";
import "./hud/hud-base.css";
import "./hud/identidade.css";

const livros = [ancora, cacador, combatente, face, infiltrador, tecnico, vanguarda] as unknown as { classes: ClassContentV12[]; subclasses: SubclassContentV12[] }[];
const classes = livros.flatMap(l => l.classes) as unknown as ClassContentV12[];
const subclasses = livros.flatMap(l => l.subclasses) as unknown as SubclassContentV12[];
const ranks = ["F", "E", "D", "C", "B", "A", "S"];
const nome = (id?: string) => id ? id.replaceAll("_", " ") : "Não definido";
type Campo = [keyof IdentityDossier, string, string?];
const grupos: { titulo: string; campos: Campo[] }[] = [
  { titulo: "Apresentação", campos: [["codinome", "Codinome"], ["pronomes", "Pronomes"], ["local_origem", "Localidade de origem"], ["conceito", "Conceito", "Quem é você, em uma frase?"], ["aparencia", "Aparência", "Marcas, gestos, voz e detalhes reconhecíveis"], ["historia", "Como se tornou refratário"]] },
  { titulo: "Registro imperial ativo", campos: [["nome_registrado", "Nome registrado"], ["ocupacao", "Ocupação declarada"], ["origem", "Origem declarada"], ["id_sinaptico", "ID sináptico"], ["nivel_rpi", "Nível do RPI"], ["situacao_rpi", "Situação do RPI"], ["sinalizado_por", "Sinalizado por"], ["alcance_registro", "Alcance do registro", "Quem conhece o alerta? Em quais locais?"], ["credenciais", "Credenciais", "Permissão · emissor · validade · identidade vinculada"], ["registros_alternativos", "Identidades alternativas", "Nome · nível · situação · credenciais de cada RPI"]] },
  { titulo: "Motivações e vínculos", campos: [["objetivo", "Objetivo atual"], ["conviccao", "Convicção"], ["temor", "Temor"], ["vinculos", "Contatos e facções", "Nome · relação · onde encontrar · o que pode oferecer"], ["pendencias", "Dívidas e promessas", "Com quem · o que está em jogo · próximo passo"]] },
];
const longos = new Set(["aparencia", "historia", "credenciais", "registros_alternativos", "vinculos", "pendencias", "alcance_registro"]);

export function IdentityPanel({ api, avatarUrl, onCompletar, onEvoluir }: { onCompletar?: () => void; onEvoluir?: (ranking: RankingV12) => void; api: Pick<ConsoleApi, "character" | "editarIdentidade" | "somenteLeitura" | "gravacao"> & Partial<Pick<ConsoleApi, "classe" | "catalogo" | "derivados" | "rolarPericia" | "rolarDefesa" | "definirPd" | "mercadoriasEspeciais" | "rolarTeste" | "atributoDaPericia">>; avatarUrl?: string | null }) {
  const c = api.character as Partial<CharacterV2> & ConsoleApi["character"];
  const t = c.trajetoria, p = c.progressao;
  const salvo = readIdentityDossier(c.metadados?.identidade);
  const dados: IdentityDossier = {
    local_origem: t?.local_origem, codinome: t?.codinome, conceito: t?.conceito, aparencia: t?.aparencia, historia: t?.relato_refratario,
    nome_registrado: t?.rpi_forjado?.nome_registrado, ocupacao: t?.rpi_forjado?.ocupacao_declarada,
    origem: t?.rpi_forjado?.origem, nivel_rpi: t?.rpi_forjado ? String(t.rpi_forjado.nivel) : "",
    ...salvo,
  };
  const [editar, setEditar] = useState(false);
  const [rascunho, setRascunho] = useState<IdentityDossier>({});
  const [detalhe, setDetalhe] = useState<"classe" | "subclasse" | "trajetoria" | null>(null);
  const [traco, setTraco] = useState<number | null>(null);
  const retorno = useRef<HTMLElement | null>(null);
  useEffect(() => { if (!editar && !detalhe && traco === null) retorno.current?.focus(); }, [editar, detalhe, traco]);
  const classe = classes.find(i => i.slug === p?.classe_id);
  const sub = p?.ranking && reached(p.ranking, "E") ? subclasses.find(i => i.slug === p?.subclasse_id) : undefined;
  const antecedente = trajetorias.backgrounds.find(i => i.slug === t?.antecedente?.antecedente_id);
  const selecionado = detalhe === "classe" ? classe : detalhe === "subclasse" ? sub : detalhe === "trajetoria" ? antecedente : undefined;
  const abrir = (tipo: typeof detalhe) => { retorno.current = document.activeElement as HTMLElement; setDetalhe(tipo); };
  const texto = (valor?: string, vazio = "Não registrado") => valor?.trim() || vazio;
  const situacao = { integro: "Íntegro", sinalizado: "Sinalizado", comprometido: "Comprometido" }[dados.situacao_rpi ?? ""] ?? "Não registrada";
  const ficha = (titulo: string, valor?: string) => <div className="hi-fato"><span className="hx-tag">{titulo}</span><p data-vazio={!valor?.trim()}>{texto(valor)}</p></div>;
  const regiao = regiaoValida(t?.regiao_id);
  const idioma = (id: string) => { const limpo = id.replaceAll("_", " ").trim(); return limpo.charAt(0).toLocaleUpperCase("pt-BR") + limpo.slice(1); };
  const tracos = [
    ...(t?.qualidades ?? []).map(q => ({ id: q.quality_id, pontos: q.pontos, detalhes: q.detalhes, tipo: "Qualidade", cor: "#32c978", modelo: trajetorias.qualities.find(x => x.slug === q.quality_id) })),
    ...(t?.complicacoes ?? []).map(q => ({ id: q.complication_id, pontos: q.pontos, detalhes: q.detalhes, tipo: "Complicação", cor: "#ff5f74", modelo: trajetorias.complications.find(x => x.slug === q.complication_id) })),
  ];
  const tracoAtivo = traco === null ? null : tracos[traco];
  const editarDossie = () => { retorno.current = document.activeElement as HTMLElement; setRascunho(dados); setEditar(true); };
  const podeEditar = !api.somenteLeitura && !!api.editarIdentidade;
  const anotacoes: { titulo: string; campos: [string, string | undefined][] }[] = [
    { titulo: "História e aparência", campos: [["Conceito", dados.conceito], ["Aparência", dados.aparencia], ["Como se tornou refratário", dados.historia], ["Localidade de origem", dados.local_origem]] },
    { titulo: "Motivações", campos: [["Objetivo atual", dados.objetivo], ["Convicção", dados.conviccao], ["Temor", dados.temor]] },
    { titulo: "Vínculos e pendências", campos: [["Contatos e facções", dados.vinculos], ["Dívidas e promessas", dados.pendencias]] },
    { titulo: "Credenciais e identidades", campos: [["Credenciais", dados.credenciais], ["Identidades alternativas", dados.registros_alternativos]] },
  ];
  return <section className={`hx hi-painel ${oxanium.variable}`} aria-label="Identidade do personagem">
    <CabecalhoModulo id="ID://IDENTIDADE" mod="MOD.ID // 08" />
    <div className="hi-corpo">
      <header className="hi-resumo">
        <div className="hi-avatar">{avatarUrl ? <img src={avatarUrl} alt={`Retrato de ${c.nome}`} /> : <UserRound size={48} strokeWidth={1} aria-hidden="true" />}</div>
        <div className="hi-identificacao"><span className="hx-tag">{dados.codinome ? "Codinome" : "Personagem"}</span><h2>{dados.codinome || c.nome}</h2><p>{dados.codinome ? c.nome : ""}{dados.pronomes ? ` · ${dados.pronomes}` : ""}</p>
          <div className="hi-dados-origem"><span><small>REGIÃO</small> {regiao ? REGIOES_V12[regiao].nome : "—"}</span><span><small>IDIOMAS</small> {t?.idiomas?.map(idioma).join(" · ") || "—"}</span></div>
        </div>
        {podeEditar && <button className="hx-catalogo hi-editar" onClick={editarDossie}><Pencil size={14} /> Editar dossiê</button>}
      </header>
      {api.gravacao?.estado === "error" && <p role="alert" className="hi-erro">Não foi possível salvar: {api.gravacao.erro}</p>}
      <div className="hi-principal">
        <div className="hi-formacao">
          <section className="hi-secao"><h3 className="hx-tag">Formação</h3>
            <CartaoListaHud nome={classe?.nome ?? nome(p?.classe_id)} subtitulo="Classe" cor="#00d4ff" metricas={p?.ranking ? [{ valor: p.ranking, unidade: "ranking", cor: "#00d4ff" }] : []} onClick={() => abrir("classe")} />
            <CartaoListaHud nome={sub?.nome ?? (p?.ranking && !reached(p.ranking, "E") ? "Disponível no Ranking E" : "Subclasse não escolhida")} subtitulo="Subclasse" cor="#c578d9" metricas={[]} onClick={() => abrir("subclasse")} />
            <CartaoListaHud nome={antecedente?.nome ?? nome(t?.antecedente?.antecedente_id)} subtitulo="Trajetória · antecedente" cor="#ff951c" metricas={[]} onClick={() => abrir("trajetoria")} />
            {!api.somenteLeitura && (onCompletar || (p?.ranking && onEvoluir)) && <div className="hi-formacao-acoes">{onCompletar ? <button className="hx-catalogo" onClick={onCompletar}>Escolher na Forja</button> : p?.ranking && onEvoluir ? <AvancoChip ranking={p.ranking} onEscolher={onEvoluir} /> : null}</div>}
          </section>

        </div>
        <div className="hi-tracos">
          {["Qualidade", "Complicação"].map(tipo => <section className="hi-secao" key={tipo}><h3 className="hx-tag">{tipo === "Qualidade" ? "Qualidades" : "Complicações"}<span>{tracos.filter(q => q.tipo === tipo).length}</span></h3>
            {tracos.filter(q => q.tipo === tipo).length === 0 ? <p className="hi-vazio">{tipo === "Qualidade" ? "Nenhuma qualidade escolhida." : "Nenhuma complicação escolhida."}</p> : tracos.map((q, i) => q.tipo === tipo && <CartaoListaHud key={`${q.id}-${i}`} nome={q.modelo?.nome ?? nome(q.id)} subtitulo={Object.values(q.detalhes ?? {}).filter(Boolean).join(" · ") || tipo} cor={q.cor} metricas={[{ valor: q.pontos, unidade: q.pontos === 1 ? "ponto" : "pontos", cor: q.cor }]} onClick={() => { retorno.current = document.activeElement as HTMLElement; setTraco(i); }} />)}
          </section>)}
        </div>
      </div>
          <section className="hi-rpi" data-situacao={dados.situacao_rpi}>
            <div className="hi-titulo"><Fingerprint size={18} /><h3>Registro imperial</h3><span className="hx-tag">{dados.nivel_rpi ? `NV ${dados.nivel_rpi}` : "NV —"}</span></div>
            <div className="hi-status">◆ {situacao}</div>
            <div className="hi-rpi-resumo">{dados.nome_registrado?.trim() ? ficha("Nome registrado", dados.nome_registrado) : <p className="hi-vazio">Nome de cobertura não preenchido.</p>}{dados.ocupacao?.trim() && ficha("Ocupação", dados.ocupacao)}</div>
            {(dados.origem || dados.id_sinaptico || dados.sinalizado_por || dados.alcance_registro) && <details className="hi-rpi-detalhes"><summary>Dados do registro</summary>{dados.origem && ficha("Origem declarada", dados.origem)}{dados.id_sinaptico && ficha("ID sináptico", dados.id_sinaptico)}{dados.sinalizado_por && ficha("Sinalizado por", dados.sinalizado_por)}{dados.alcance_registro && ficha("Alcance", dados.alcance_registro)}</details>}
          </section>
      <section className="hi-arquivo"><h3 className="hx-tag">Anotações do personagem</h3>
        {anotacoes.map(grupo => { const preenchidos = grupo.campos.filter(([, v]) => v?.trim()); return <details key={grupo.titulo}><summary><span>{grupo.titulo}</span><span className="hx-tag">{preenchidos.length ? `${preenchidos.length} ${preenchidos.length === 1 ? "registro" : "registros"}` : "Sem anotações"}</span></summary><div className="hi-anotacoes">{preenchidos.length ? preenchidos.map(([rotulo, valor]) => <div key={rotulo}>{ficha(rotulo, valor)}</div>) : <p className="hi-vazio">Nenhuma anotação nesta seção.</p>}{podeEditar && <button className="hi-link" onClick={editarDossie}><Pencil size={12} /> Editar anotações</button>}</div></details>; })}
      </section>
    </div>
    {(detalhe || editar || tracoAtivo) && <JanelaMercado titulo={editar ? "Editar dossiê" : tracoAtivo?.modelo?.nome ?? selecionado?.nome ?? "Formação"} onFechar={() => { setDetalhe(null); setEditar(false); setTraco(null); }}>{fechar => <div className={`hx hi-janela ${oxanium.variable}`}>
      <header><span className="hx-tag">{editar ? "DOSSIÊ // EDIÇÃO" : `DOSSIÊ // ${tracoAtivo?.tipo ?? detalhe}`}</span><button onClick={fechar} aria-label="Fechar"><X size={18} /></button></header>
      {editar ? <form onSubmit={e => { e.preventDefault(); if (!api.somenteLeitura) api.editarIdentidade?.(rascunho); fechar(); }}>
        <div className="hi-editor"><h2>Editar dossiê</h2><p>Os campos em branco não aparecem como anotações na ficha.</p>
          {grupos.map(g => <fieldset key={g.titulo}><legend>{g.titulo}</legend>{g.campos.map(([chave, rotulo, placeholder]) => <label key={chave} className={longos.has(chave) ? "hi-campo-longo" : ""}><span className="hx-tag">{rotulo}</span>
            {chave === "situacao_rpi" || chave === "nivel_rpi" ? <select aria-label={rotulo} value={rascunho[chave] ?? ""} onChange={e => setRascunho(d => ({ ...d, [chave]: e.target.value }))}><option value="">Não registrado</option>{(chave === "nivel_rpi" ? [["1", "1 · Básico"], ["2", "2 · Cruzado"], ["3", "3 · Profundo"]] : [["integro", "Íntegro"], ["sinalizado", "Sinalizado"], ["comprometido", "Comprometido"]]).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select> : longos.has(chave) ? <textarea aria-label={rotulo} rows={3} maxLength={5000} value={rascunho[chave] ?? ""} placeholder={placeholder} onChange={e => setRascunho(d => ({ ...d, [chave]: e.target.value }))} /> : <input aria-label={rotulo} maxLength={500} value={rascunho[chave] ?? ""} placeholder={placeholder} onChange={e => setRascunho(d => ({ ...d, [chave]: e.target.value }))} />}
          </label>)}</fieldset>)}
        </div><footer><span>Alterações aplicadas ao salvar</span><button type="button" onClick={fechar}>Cancelar</button><button type="submit" className="hi-salvar"><Save size={15} /> Salvar dossiê</button></footer>
      </form> : <div className="hi-detalhe"><div className="hi-emblema"><ShieldCheck size={58} strokeWidth={1} /></div><h2>{tracoAtivo?.modelo?.nome ?? (tracoAtivo ? nome(tracoAtivo.id) : selecionado?.nome) ?? "Escolha não registrada"}</h2><p>{tracoAtivo?.modelo?.descricao ?? selecionado?.descricao ?? "As escolhas de classe, subclasse e antecedente são feitas na Forja de criação e na evolução do personagem."}</p>
        {!tracoAtivo && detalhe !== "trajetoria" && selecionado && "caracteristicas" in selecionado && Object.entries(selecionado.caracteristicas).sort(([a], [b]) => ranks.indexOf(a) - ranks.indexOf(b)).map(([rank, habilidades]) => <section key={rank} className="hi-habilidades"><h3 className="hx-tag">Ranking {rank} · {ranks.indexOf(rank) <= ranks.indexOf(p?.ranking ?? "") ? "Alcançado" : "Progressão"}</h3>{habilidades.map(h => <article key={h.slug}><h4>{h.nome}</h4><p>{h.descricao}</p></article>)}</section>)}
        {tracoAtivo && <><h3 className="hx-tag">{tracoAtivo.tipo} · {tracoAtivo.pontos} {tracoAtivo.pontos === 1 ? "ponto" : "pontos"}</h3>{Object.entries(tracoAtivo.detalhes ?? {}).map(([rotulo, valor]) => <div key={rotulo}>{ficha(idioma(rotulo), valor)}</div>)}</>}
        {detalhe === "trajetoria" && <>{antecedente && <>{ficha("Familiaridade", antecedente.familiaridade)}<h3 className="hx-tag">Recurso · 1 uso por sessão</h3>{antecedente.recurso_por_sessao.opcoes.map(o => <p key={o}>{o}</p>)}</>}{ficha("Meio", t?.antecedente?.meio)}{ficha("Papel", t?.antecedente?.papel)}{ficha("Relação atual", t?.antecedente?.relacao_atual)}{ficha("Estopim", t?.transformacao_refratario?.estopim)}{ficha("Consequência", t?.transformacao_refratario?.consequencia)}
        {[...(t?.qualidades ?? []).map(q => ({ ...q, id: q.quality_id, tipo: "Qualidade" })), ...(t?.complicacoes ?? []).map(q => ({ ...q, id: q.complication_id, tipo: "Complicação" }))].map((q, i) => <div key={`${q.id}-${i}`}>{ficha(`${q.tipo} · ${q.pontos} ponto(s)`, [...trajetorias.qualities, ...trajetorias.complications].find(x => x.slug === q.id)?.nome ?? nome(q.id))}{Object.entries(q.detalhes).map(([k, v]) => <p key={k}>{nome(k)}: {v}</p>)}</div>)}
        </>}
      </div>}
    </div>}</JanelaMercado>}
  </section>;
}
