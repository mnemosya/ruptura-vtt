"use client";
import { TextoComRegras } from "../TextoComRegras";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpenText, ChevronRight, CirclePlus, Fingerprint, IdCard, Link2, Lock, Pencil, Route, Save, Shield, ShieldCheck, Split, Target, TriangleAlert, UserRound, X, type LucideIcon } from "lucide-react";
import { ICONES_CLASSE } from "../tabs";
import { ANTECEDENTE_PERSONALIZADO_ID, REGIOES_V12, regiaoValida } from "../../../../lib/rulesetV12/contracts";
import type { CharacterV2, ClassContentV12, SubclassContentV12, RankingV12 } from "../../../../lib/rulesetV12/contracts";
import { readIdentityDossier, type IdentityDossier } from "../../../../lib/character/identity";
import { reached } from "../../../../lib/character/classManagement";
import type { ConsoleApi } from "../types";
import { AvancoChip } from "./ModoEvolucao";
import { CabecalhoModulo } from "./CabecalhoModulo";
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

const NIVEIS_RPI: Record<string, string> = { "1": "Básico", "2": "Cruzado", "3": "Profundo" };

const VERDE = "#32c978", VERMELHO = "#ff5f74", APAGADO = "#7f95b3";
const ICONES_NOTAS: Record<string, LucideIcon> = { "História e aparência": BookOpenText, "Motivações": Target, "Vínculos e pendências": Link2, "Credenciais e identidades": IdCard };

/** Um campo do dossiê. Texto longo entra recolhido e abre no lugar. */
function Nota({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [aberta, setAberta] = useState(false);
  const longa = valor.length > 260 || valor.split("\n").length > 4;
  return <div className="hi-fato"><span className="hx-tag">{rotulo}</span><p data-recolhida={(longa && !aberta) || undefined} data-aberta={(longa && aberta) || undefined}>{valor}</p>
    {longa && <button type="button" className="hi-link" onClick={() => setAberta(v => !v)} aria-expanded={aberta}>{aberta ? "Recolher" : "Ler tudo"}</button>}
  </div>;
}

/** Cabeçalho de seção: losango, título, fio que se desenha e o que vier à direita. */
function CabSecao({ titulo, cor, nota, children }: { titulo: string; cor?: string; nota?: ReactNode; children?: ReactNode }) {
  return <div className="hi-cab" style={cor ? { "--k": cor } as CSSProperties : undefined}>
    <span className="hi-cab-lo" aria-hidden="true" /><h3>{titulo}</h3><i aria-hidden="true" />
    {nota && <span className="hi-cab-nota">{nota}</span>}{children}
  </div>;
}

/**
 * Cartão da aba — a mesma anatomia para formação e traços: quadro do
 * ícone, nome, uma linha de apoio e, à direita, a métrica e a seta de
 * "abre". O fio é a camada de trás (1px), pra acompanhar o chanfro.
 */
function Cartao({ cor, icone, nome, sub, desc, chips, metrica, apagado, ordem, onClick }: {
  cor: string; icone: ReactNode; nome: ReactNode; sub?: string; desc?: string; chips?: [string, string][];
  metrica?: { valor: ReactNode; unidade: string }; apagado?: boolean; ordem: number; onClick: () => void;
}) {
  return <button type="button" className={`hx-cartao-magia hi-cartao${desc ? " hi-cartao--traco" : ""}`} data-apagado={apagado || undefined}
    style={{ "--k": apagado ? APAGADO : cor, "--i": ordem } as CSSProperties} onClick={onClick}>
    <span className="hi-cartao-in">
      <span className="hi-cartao-ic" aria-hidden="true">{icone}</span>
      <span className="hi-cartao-txt">
        <strong>{nome}</strong>
        {sub && <span className="hi-cartao-sub">{sub}</span>}
        {desc && <span className="hi-cartao-desc">{desc}</span>}
        {chips && chips.length > 0 && <span className="hi-cartao-chips">{chips.map(([k, v]) => <span key={k}><small>{k}</small>{v}</span>)}</span>}
      </span>
      {metrica && <span className="hi-cartao-pts"><b>{metrica.valor}</b><small>{metrica.unidade}</small></span>}
      <ChevronRight className="hi-cartao-seta" size={15} aria-hidden="true" />
    </span>
  </button>;
}

/** Topo da janela de detalhe: a arte da classe/subclasse quando existe, senão o emblema. */
function EmblemaDetalhe({ arte, cor, children }: { arte?: string; cor: string; children: ReactNode }) {
  const [falhou, setFalhou] = useState(false);
  const comArte = !!arte && !falhou;
  return <div className="hi-emblema" data-arte={comArte || undefined} style={{ "--k": cor } as CSSProperties}>
    {comArte ? <img src={arte} alt="" onError={() => setFalhou(true)} /> : children}
  </div>;
}

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
  const antecedenteAutoral = t?.antecedente?.antecedente_id === ANTECEDENTE_PERSONALIZADO_ID ? t.antecedente : null;
  const nomeAntecedente = antecedenteAutoral?.titulo || antecedente?.nome || nome(t?.antecedente?.antecedente_id);
  const recursoAntecedente = antecedente?.recurso_por_sessao.opcoes ?? (antecedenteAutoral ? trajetorias.backgrounds[0]?.recurso_por_sessao.opcoes : undefined);
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
  const nomeTraco = (q: (typeof tracos)[number]) => q.modelo?.nome ?? q.detalhes?.titulo ?? nome(q.id);
  const descricaoTraco = (q: (typeof tracos)[number]) => q.modelo?.descricao ?? q.detalhes?.descricao;
  const editarDossie = () => { retorno.current = document.activeElement as HTMLElement; setRascunho(dados); setEditar(true); };
  const podeEditar = !api.somenteLeitura && !!api.editarIdentidade;
  const anotacoes: { titulo: string; campos: [string, string | undefined][] }[] = [
    { titulo: "História e aparência", campos: [["Aparência", dados.aparencia], ["Como se tornou refratário", dados.historia], ["Localidade de origem", dados.local_origem]] },
    { titulo: "Motivações", campos: [["Objetivo atual", dados.objetivo], ["Convicção", dados.conviccao], ["Temor", dados.temor]] },
    { titulo: "Vínculos e pendências", campos: [["Contatos e facções", dados.vinculos], ["Dívidas e promessas", dados.pendencias]] },
    { titulo: "Credenciais e identidades", campos: [["Credenciais", dados.credenciais], ["Identidades alternativas", dados.registros_alternativos]] },
  ];
  const fatosRpi: [string, string | undefined][] = [["Nome registrado", dados.nome_registrado], ["Ocupação declarada", dados.ocupacao], ["Origem declarada", dados.origem], ["ID sináptico", dados.id_sinaptico], ["Sinalizado por", dados.sinalizado_por], ["Alcance do registro", dados.alcance_registro]];
  const rpiPreenchido = fatosRpi.filter((f): f is [string, string] => !!f[1]?.trim());
  const comNotas = anotacoes.map(g => ({ titulo: g.titulo, campos: g.campos.filter((f): f is [string, string] => !!f[1]?.trim()) })).filter(g => g.campos.length);
  const semNotas = anotacoes.filter(g => !g.campos.some(([, v]) => v?.trim())).map(g => g.titulo);
  const IconeClasse = (classe && ICONES_CLASSE[classe.slug]) || Shield;
  const rankAtual = p?.ranking ? ranks.indexOf(p.ranking) : -1;
  const subBloqueada = !!p?.ranking && !reached(p.ranking, "E");
  const nivelRpi = Number(dados.nivel_rpi) || 0;
  /** O que a pessoa escreveu sobre o traço (quem é o contato, a quem deve) vira etiqueta no cartão. */
  const chipsTraco = (q: (typeof tracos)[number]): [string, string][] => Object.entries(q.detalhes ?? {}).filter(([k, v]) => k !== "titulo" && k !== "descricao" && v?.trim()).slice(0, 3).map(([k, v]) => [idioma(k), v]);
  return <section className={`hx hi-painel ${oxanium.variable}`} aria-label="Identidade do personagem">
    <CabecalhoModulo id="ID://IDENTIDADE" mod="MOD.ID // 09" />
    <div className="hi-corpo">
      <header className="hi-resumo">
        {regiao && <div className="hi-fundo" aria-hidden="true" style={{ backgroundImage: `url(/forja/regioes/${regiao}.webp)` }} />}
        <div className="hi-avatar"><span className="hi-avatar-in">{avatarUrl ? <img src={avatarUrl} alt={`Retrato de ${c.nome}`} /> : <UserRound size={52} strokeWidth={1} aria-hidden="true" />}</span></div>
        <div className="hi-identificacao"><span className="hx-tag">{dados.codinome ? "Codinome" : "Personagem"}</span><h2>{dados.codinome || c.nome}</h2>
          {(dados.codinome || dados.pronomes) && <p>{[dados.codinome ? c.nome : "", dados.pronomes].filter(Boolean).join(" · ")}</p>}
          {dados.conceito?.trim() && <p className="hi-conceito">{dados.conceito}</p>}
          <div className="hi-dados-origem"><span><small>REGIÃO</small> {regiao ? REGIOES_V12[regiao].nome : "—"}</span><span><small>IDIOMAS</small> {t?.idiomas?.map(idioma).join(" · ") || "—"}</span></div>
        </div>
        {podeEditar && <button className="hx-catalogo hi-editar" onClick={editarDossie}><Pencil size={14} /> Editar dossiê</button>}
      </header>
      {api.gravacao?.estado === "error" && <p role="alert" className="hi-erro">Não foi possível salvar: {api.gravacao.erro}</p>}

      <section className="hi-secao hi-formacao">
        <CabSecao titulo="Formação">
          {rankAtual >= 0 && <div className="hi-rank" role="img" aria-label={`Ranking ${p?.ranking}`}>
            <span className="hx-tag">Ranking</span>
            <span className="hi-rank-trilha">{ranks.map((r, n) => <i key={r} data-estado={n < rankAtual ? "feito" : n === rankAtual ? "atual" : undefined} style={{ "--i": n } as CSSProperties}>{r}</i>)}</span>
          </div>}
          {!api.somenteLeitura && (onCompletar ? <button className="hx-catalogo hi-acao" onClick={onCompletar}>Escolher na Forja</button> : p?.ranking && onEvoluir ? <AvancoChip ranking={p.ranking} onEscolher={onEvoluir} /> : null)}
        </CabSecao>
        <div className="hi-grade3">
          <Cartao ordem={0} cor="#00d4ff" icone={<IconeClasse size={19} strokeWidth={1.7} />} nome={classe?.nome ?? nome(p?.classe_id)} sub="Classe" apagado={!classe} onClick={() => abrir("classe")} />
          <Cartao ordem={1} cor="#c578d9" icone={subBloqueada ? <Lock size={17} strokeWidth={1.7} /> : <Split size={18} strokeWidth={1.7} />} nome={sub?.nome ?? (subBloqueada ? "Disponível no Ranking E" : "Subclasse não escolhida")} sub="Subclasse" apagado={!sub} onClick={() => abrir("subclasse")} />
          <Cartao ordem={2} cor="#ff951c" icone={<Route size={18} strokeWidth={1.7} />} nome={nomeAntecedente} sub="Antecedente" apagado={!antecedente && !antecedenteAutoral} onClick={() => abrir("trajetoria")} />
        </div>
      </section>

      <div className="hi-tracos">
        {(["Qualidade", "Complicação"] as const).map(tipo => {
          const lista = tracos.map((q, n) => ({ q, n })).filter(x => x.q.tipo === tipo);
          const pontos = lista.reduce((soma, x) => soma + x.q.pontos, 0);
          const cor = tipo === "Qualidade" ? VERDE : VERMELHO;
          return <section className="hi-secao" key={tipo}>
            <CabSecao titulo={tipo === "Qualidade" ? "Qualidades" : "Complicações"} cor={cor} nota={lista.length > 0 ? `${pontos} ${pontos === 1 ? "ponto" : "pontos"}` : undefined} />
            {lista.length === 0 ? <p className="hi-vazio">{tipo === "Qualidade" ? "Nenhuma qualidade escolhida." : "Nenhuma complicação escolhida."}</p> : <div className="hi-pilha">{lista.map(({ q, n }, ordem) =>
              <Cartao key={`${q.id}-${n}`} ordem={ordem} cor={cor} icone={tipo === "Qualidade" ? <CirclePlus size={18} strokeWidth={1.7} /> : <TriangleAlert size={18} strokeWidth={1.7} />}
                nome={nomeTraco(q)} desc={descricaoTraco(q) || tipo} chips={chipsTraco(q)} metrica={{ valor: q.pontos, unidade: q.pontos === 1 ? "ponto" : "pontos" }}
                onClick={() => { retorno.current = document.activeElement as HTMLElement; setTraco(n); }} />)}</div>}
          </section>;
        })}
      </div>

      <section className="hi-secao hi-rpi" data-situacao={dados.situacao_rpi}>
        <CabSecao titulo="Registro imperial" />
        <div className="hi-doc">
          <div className="hi-doc-topo">
            <span className="hi-doc-ic" aria-hidden="true"><Fingerprint size={19} strokeWidth={1.6} /></span>
            {nivelRpi > 0 ? <span className="hi-doc-nivel"><span className="hi-doc-pips" aria-hidden="true">{[1, 2, 3].map(n => <i key={n} data-on={n <= nivelRpi || undefined} />)}</span>Nível {nivelRpi}{NIVEIS_RPI[String(nivelRpi)] ? ` · ${NIVEIS_RPI[String(nivelRpi)]}` : ""}</span> : <span className="hi-doc-nivel" data-vazio="true">Nível não registrado</span>}
            <span className="hi-status"><i aria-hidden="true" /><span>{dados.situacao_rpi ? situacao : "Situação não registrada"}</span></span>
          </div>
          {rpiPreenchido.length ? <div className="hi-doc-fatos">{rpiPreenchido.map(([rotulo, valor]) => <Nota key={rotulo} rotulo={rotulo} valor={valor} />)}</div> : <p className="hi-vazio">Registro não preenchido.</p>}
        </div>
      </section>

      <section className="hi-secao hi-arquivo">
        <CabSecao titulo="Anotações do personagem">{podeEditar && comNotas.length > 0 && <button className="hi-link" onClick={editarDossie}><Pencil size={12} /> Editar anotações</button>}</CabSecao>
        {comNotas.map(grupo => { const Icone = ICONES_NOTAS[grupo.titulo] ?? BookOpenText; return <section key={grupo.titulo} className="hi-nota-grupo"><h4><Icone size={15} strokeWidth={1.7} aria-hidden="true" />{grupo.titulo}</h4>
          <div className="hi-nota-campos">{grupo.campos.map(([rotulo, valor]) => <Nota key={rotulo} rotulo={rotulo} valor={valor} />)}</div>
        </section>; })}
        {comNotas.length === 0 ? <div className="hi-arquivo-vazio"><p className="hi-vazio">Nenhuma anotação registrada.</p>{podeEditar && <button className="hx-catalogo hi-acao" onClick={editarDossie}><Pencil size={13} /> Escrever anotações</button>}</div>
          : semNotas.length > 0 && <p className="hi-vazio hi-sem-notas"><span className="hx-tag">Sem anotações</span>{semNotas.join(" · ")}</p>}
      </section>
    </div>
    {(detalhe || editar || tracoAtivo) && <JanelaMercado titulo={editar ? "Editar dossiê" : tracoAtivo ? nomeTraco(tracoAtivo) : (detalhe === "trajetoria" ? nomeAntecedente : selecionado?.nome) ?? "Formação"} onFechar={() => { setDetalhe(null); setEditar(false); setTraco(null); }}>{fechar => <div className={`hx hi-janela ${oxanium.variable}`}>
      <header><span className="hx-tag">{editar ? "DOSSIÊ // EDIÇÃO" : `DOSSIÊ // ${tracoAtivo?.tipo ?? detalhe}`}</span><button onClick={fechar} aria-label="Fechar"><X size={18} /></button></header>
      {editar ? <form onSubmit={e => { e.preventDefault(); if (!api.somenteLeitura) api.editarIdentidade?.(rascunho); fechar(); }}>
        <div className="hi-editor"><h2>Editar dossiê</h2><p>Os campos em branco não aparecem como anotações na ficha.</p>
          {grupos.map(g => <fieldset key={g.titulo}><legend>{g.titulo}</legend>{g.campos.map(([chave, rotulo, placeholder]) => <label key={chave} className={longos.has(chave) ? "hi-campo-longo" : ""}><span className="hx-tag">{rotulo}</span>
            {chave === "situacao_rpi" || chave === "nivel_rpi" ? <select aria-label={rotulo} value={rascunho[chave] ?? ""} onChange={e => setRascunho(d => ({ ...d, [chave]: e.target.value }))}><option value="">Não registrado</option>{(chave === "nivel_rpi" ? [["1", "1 · Básico"], ["2", "2 · Cruzado"], ["3", "3 · Profundo"]] : [["integro", "Íntegro"], ["sinalizado", "Sinalizado"], ["comprometido", "Comprometido"]]).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select> : longos.has(chave) ? <textarea aria-label={rotulo} rows={3} maxLength={5000} value={rascunho[chave] ?? ""} placeholder={placeholder} onChange={e => setRascunho(d => ({ ...d, [chave]: e.target.value }))} /> : <input aria-label={rotulo} maxLength={500} value={rascunho[chave] ?? ""} placeholder={placeholder} onChange={e => setRascunho(d => ({ ...d, [chave]: e.target.value }))} />}
          </label>)}</fieldset>)}
        </div><footer><span>Alterações aplicadas ao salvar</span><button type="button" onClick={fechar}>Cancelar</button><button type="submit" className="hi-salvar"><Save size={15} /> Salvar dossiê</button></footer>
      </form> : <div className="hi-detalhe"><EmblemaDetalhe cor={tracoAtivo?.cor ?? (detalhe === "subclasse" ? "#c578d9" : detalhe === "trajetoria" ? "#ff951c" : "#00d4ff")} arte={tracoAtivo ? undefined : detalhe === "classe" && classe ? `/forja/classes/${classe.slug}.webp` : detalhe === "subclasse" && sub ? `/forja/subclasses/${sub.slug}.webp` : undefined}>
        {tracoAtivo ? (tracoAtivo.tipo === "Qualidade" ? <CirclePlus size={58} strokeWidth={1} /> : <TriangleAlert size={58} strokeWidth={1} />) : detalhe === "trajetoria" ? <Route size={58} strokeWidth={1} /> : detalhe === "subclasse" ? <Split size={58} strokeWidth={1} /> : <ShieldCheck size={58} strokeWidth={1} />}
      </EmblemaDetalhe><h2>{tracoAtivo ? nomeTraco(tracoAtivo) : (detalhe === "trajetoria" ? nomeAntecedente : selecionado?.nome) ?? "Escolha não registrada"}</h2><TextoComRegras texto={(tracoAtivo ? descricaoTraco(tracoAtivo) : detalhe === "trajetoria" ? antecedenteAutoral?.descricao : selecionado?.descricao) ?? "As escolhas de classe, subclasse e antecedente são feitas na Forja de criação e na evolução do personagem."} glossario={[]}/>
        {!tracoAtivo && detalhe !== "trajetoria" && selecionado && "caracteristicas" in selecionado && Object.entries(selecionado.caracteristicas).sort(([a], [b]) => ranks.indexOf(a) - ranks.indexOf(b)).map(([rank, habilidades]) => <section key={rank} className="hi-habilidades"><h3 className="hx-tag">Ranking {rank} · {ranks.indexOf(rank) <= ranks.indexOf(p?.ranking ?? "") ? "Alcançado" : "Progressão"}</h3>{habilidades.map(h => <article key={h.slug}><h4>{h.nome}</h4><TextoComRegras texto={h.descricao} glossario={[]}/></article>)}</section>)}
        {tracoAtivo && <><h3 className="hx-tag">{tracoAtivo.tipo} · {tracoAtivo.pontos} {tracoAtivo.pontos === 1 ? "ponto" : "pontos"}</h3>{Object.entries(tracoAtivo.detalhes ?? {}).filter(([rotulo]) => rotulo !== "titulo" && rotulo !== "descricao").map(([rotulo, valor]) => <div key={rotulo}>{ficha(idioma(rotulo), valor)}</div>)}</>}
        {detalhe === "trajetoria" && <>{ficha("Familiaridade", antecedenteAutoral?.familiaridade ?? antecedente?.familiaridade)}{recursoAntecedente && <><h3 className="hx-tag">Recurso · 1 uso por sessão</h3>{recursoAntecedente.map(o => <TextoComRegras key={o} texto={o} glossario={[]}/>)}</>}{ficha("Meio", t?.antecedente?.meio)}{ficha("Papel", t?.antecedente?.papel)}{ficha("Relação atual", t?.antecedente?.relacao_atual)}{ficha("Estopim", t?.transformacao_refratario?.estopim)}{ficha("Consequência", t?.transformacao_refratario?.consequencia)}
        {[...(t?.qualidades ?? []).map(q => ({ ...q, id: q.quality_id, tipo: "Qualidade" })), ...(t?.complicacoes ?? []).map(q => ({ ...q, id: q.complication_id, tipo: "Complicação" }))].map((q, i) => <div key={`${q.id}-${i}`}>{ficha(`${q.tipo} · ${q.pontos} ponto(s)`, [...trajetorias.qualities, ...trajetorias.complications].find(x => x.slug === q.id)?.nome ?? q.detalhes?.titulo ?? nome(q.id))}{Object.entries(q.detalhes).filter(([k]) => k !== "titulo").map(([k, v]) => <p key={k}>{nome(k)}: {v}</p>)}</div>)}
        </>}
      </div>}
    </div>}</JanelaMercado>}
  </section>;
}
