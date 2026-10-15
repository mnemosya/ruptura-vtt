"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, BookOpen, BrainCircuit, Check, ChevronDown, Cpu, Ear, Eye, Fingerprint, Footprints, Hand, HeartPulse, Layers, Search, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { formatTechnicalContentField, type TechnicalContentItem } from "../../../../lib/content";
import type { InstalledEscalpo } from "../../../../lib/character";
import { dadosEscalpo, normalizarEscalpo, REGIOES_ESCALPOS, regiaoEscalpo } from "../../../../lib/character/escalpoPresentation";
import { marketEscalpoParents } from "../../../../lib/character/marketEscalpos";
import { itemDescription } from "../../../../lib/character/itemDescription";
import { corCategoria } from "../../../_design/itemCategoryColors";
import { oxanium } from "../../../_design/oxanium";
import { BODY_PATHS } from "../bodySilhouette";
import type { ConsoleApi } from "../types";
import { TextoComRegras } from "../TextoComRegras";
import { CabecalhoModulo } from "./CabecalhoModulo";
import { CartaoListaHud } from "./hud/CartaoListaHud";
import { JanelaMercado } from "./hud/JanelaMercado";
import { FichaItemConteudo, type PecaHud } from "./hud/EquipamentoHud";
import "./hud/hud-base.css";
import "./hud/catalogo-magias.css";
import "./hud/escalpos.css";

const COR = corCategoria("escalpos")!;
const moeda = (n: number) => `Ⱥ ${n.toLocaleString("pt-BR")}`;
const custo = (n: number | null) => n == null ? "—" : n ? `−${n}` : "0";
const ICONES = { neurais: BrainCircuit, opticos: Eye, auditivos: Ear, de_braco: Hand, internos: HeartPulse, de_perna: Footprints, de_moda: Sparkles, identidade: Fingerprint, proteses: Wrench, outros: Cpu };
type Registro = { id: string; nome: string; modelo?: TechnicalContentItem; instancia?: InstalledEscalpo };
type EscalposApi = Pick<ConsoleApi, "character" | "derivados" | "catalogo" | "escalpos" | "glossario" | "somenteLeitura">;
const NOS = [
  { id: "neurais", x: 38, y: 48, px: 180, py: 55 },
  { id: "opticos", x: 322, y: 48, px: 185, py: 73 },
  { id: "auditivos", x: 38, y: 173, px: 173, py: 80 },
  { id: "internos", x: 322, y: 173, px: 179, py: 182 },
  { id: "de_braco", x: 38, y: 298, px: 111, py: 202 },
  { id: "de_moda", x: 322, y: 298, px: 209, py: 242 },
  { id: "de_perna", x: 38, y: 423, px: 150, py: 394 },
  { id: "identidade", x: 322, y: 423, px: 204, py: 325 },
];

/** A aba é o corpo do personagem. O catálogo abre na mesma janela de Magias e Mercado. */
export function EscalposPanel({ api }: { api: EscalposApi }) {
  const [busca, setBusca] = useState("");
  const [regiao, setRegiao] = useState("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  const [guia, setGuia] = useState(false);
  const publicados = api.escalpos.catalogo.filter(e => e.status === "published");
  const porSlug = new Map(publicados.map(e => [e.slug, e]));
  const registros: Registro[] = (api.character.escalpos_instalados ?? []).map(i => ({ id: i.id, nome: i.nomeCustomizado || porSlug.get(i.contentId)?.nome || i.contentId, modelo: porSlug.get(i.contentId), instancia: i }));
  const visiveis = registros.filter(e => (regiao === "todos" || regiaoEscalpo(e.modelo).id === regiao) && normalizarEscalpo(`${e.nome} ${e.modelo?.descricaoCurta ?? ""}`).includes(normalizarEscalpo(busca.trim())));
  const custos = registros.map(i => dadosEscalpo(i.modelo).integridade);
  const total = custos.every(n => n != null) ? custos.reduce<number>((s, n) => s + (n ?? 0), 0) : null;
  const atual = api.character.recursos_atuais?.integridade, max = api.derivados.integridade_max;
  const ativa = REGIOES_ESCALPOS.find(r => r.id === regiao);
  const registro = registros.find(r => r.id === aberto);
  const contar = (id: string) => registros.filter(e => regiaoEscalpo(e.modelo).id === id).length;
  return <section className="rc-eq-outer" aria-label="Escalpos"><div className="rc-eq-card-outer rc-inv-moldura">
    <CabecalhoModulo id="ID://ESCALPOS" mod="MOD.BIO // 03" />
    <div className={`rc-inv hx hs ${oxanium.variable}`} data-testid="console-escalpos" style={{ ["--hs-cor" as string]: COR }}>
      <div className="hs-body-column">
        <div className="hs-body-tools"><button type="button" aria-pressed={regiao === "todos"} onClick={() => setRegiao("todos")}>Todos os sistemas</button><button type="button" onClick={() => setGuia(true)} aria-label="Guia de escalpos"><BookOpen size={15} /></button></div>
        <nav className="hs-mobile-systems" aria-label="Sistemas de implantes">{REGIOES_ESCALPOS.filter(r => NOS.some(n => n.id === r.id) || contar(r.id) > 0).map(r => { const Icon = ICONES[r.id]; return <button type="button" key={r.id} aria-pressed={regiao === r.id} onClick={() => setRegiao(regiao === r.id ? "todos" : r.id)}><Icon size={16} /><span>{r.nome}</span></button>; })}</nav>
        <div className="hs-body-stage">
          <svg viewBox="0 0 360 535" role="group" aria-label="Filtrar implantes por sistema corporal">
            <g transform="translate(98 22) scale(.8)" aria-hidden="true">{BODY_PATHS.map((p, i) => {
              const ocupado = REGIOES_ESCALPOS.some(r => r.corpo === p.regiao && contar(r.id) > 0);
              return <path key={i} d={p.d} fill={ativa?.corpo === p.regiao ? `${COR}70` : ocupado ? `${COR}30` : p.fill} stroke={ativa?.corpo === p.regiao ? COR : ocupado ? `${COR}90` : "#31505f"} strokeWidth="1" />;
            })}</g>
            {NOS.map(n => {
              const r = REGIOES_ESCALPOS.find(r => r.id === n.id)!, Icon = ICONES[r.id], quantidade = contar(r.id), selecionado = regiao === r.id;
              return <g key={r.id} className="hs-node-link" data-ativo={selecionado || undefined}><path d={`M${n.x} ${n.y}H${n.x < 180 ? 76 : 284}L${n.px} ${n.py}`} className="hs-wire" /><circle cx={n.px} cy={n.py} r="2" className="hs-wire-dot" /><g className="hs-node" data-ativo={selecionado || undefined} data-ocupado={quantidade > 0 || undefined} role="button" tabIndex={0} aria-label={`${r.nome}: ${quantidade} ${quantidade === 1 ? "implante" : "implantes"}`} aria-pressed={selecionado} onClick={() => setRegiao(selecionado ? "todos" : r.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRegiao(selecionado ? "todos" : r.id); } }}>
                <rect x={n.x - 22} y={n.y - 22} width="44" height="44" className="hs-node-box" />
                <Icon x={n.x - 11} y={n.y - 11} width={22} height={22} strokeWidth={1.5} />
                <text x={n.x} y={n.y + 38} textAnchor="middle" className="hs-node-label">{r.nome}</text>
                {quantidade > 0 && <g aria-hidden="true"><rect x={n.x + 14} y={n.y - 27} width="18" height="18" className="hs-node-badge" /><text x={n.x + 23} y={n.y - 14} textAnchor="middle" className="hs-node-count">{quantidade}</text></g>}
              </g></g>;
            })}
          </svg>
        </div>
        <div className="hs-body-caption"><h3>{ativa?.nome ?? "Sistemas rúnicos"}</h3><span className="hx-tag">{regiao === "todos" ? `${registros.length} implantes instalados` : `${contar(regiao)} nesta região`}</span></div>
        <div className="hs-bio-stats hx-ch"><div><span className="hx-tag">Ânimo</span><strong>{api.character.atributos.animo}</strong></div><div><span className="hx-tag">Instalados</span><strong>{registros.length}</strong></div><div><span className="hx-tag">Custo · INT</span><strong>{custo(total)}</strong></div></div>
        <div className="hs-integrity"><span className="hx-tag">Integridade</span><span className="hs-integrity-track" aria-hidden="true"><i style={{ width: `${atual != null && max > 0 ? Math.max(0, Math.min(100, atual / max * 100)) : 0}%` }} /></span><strong>{atual ?? "—"}<small>/{max}</small></strong></div>
      </div>
      <div className="hs-installed-column">
        <div className="hs-toolbar"><label className="cm-busca"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Buscar implante" placeholder="Buscar implante…" value={busca} onChange={e => setBusca(e.target.value)} /></label><button type="button" className="hx-catalogo" onClick={() => setCatalogoAberto(true)}><BookOpen size={17} /><span className="hx-catalogo-rot">Catálogo</span></button></div>
        {api.escalpos.erro && <p role="alert" className="hs-alert">Catálogo indisponível. Registros preservados.</p>}
        <div className="hs-installed-list hx-semsb">
          {REGIOES_ESCALPOS.map(r => {
            const grupo = visiveis.filter(e => regiaoEscalpo(e.modelo).id === r.id);
            if (!grupo.length) return null;
            return <section key={r.id}><div className="hs-section-title"><span /> <h3>{r.nome}</h3><i /><small>{grupo.length}</small></div>{grupo.map(e => {
              const d = dadosEscalpo(e.modelo);
              return <CartaoListaHud key={e.id} className="hs-implant" ariaLabel={`Ver ${e.nome}`}
                nome={e.nome} subtitulo={e.modelo?.raridadeLabel ?? e.modelo?.raridade ?? "Modelo indisponível"} cor={COR}
                onClick={() => setAberto(e.id)} metricas={[
                  { valor: custo(d.integridade), unidade: "INT", cor: "#00d4ff" },
                  { valor: d.modulos ?? "—", unidade: "módulos", cor: "#ff8a1f" },
                ]} />;
            })}</section>;
          })}
          {!visiveis.length && <div className="hs-empty"><span className="hx-ch-hex hs-empty-icon"><Cpu size={32} strokeWidth={1.2} /></span><h3>{busca ? "Nada encontrado" : regiao === "todos" ? "Sem implantes" : `Sem escalpos ${ativa?.nome.toLowerCase() === "moda" ? "de moda" : "neste sistema"}`}</h3><p>{busca ? `Nenhum implante corresponde a “${busca}”.` : "Explore os escalpos no catálogo. Depois do procedimento com o biomecânico, registre a instalação."}</p>{(busca || regiao !== "todos") && <button type="button" onClick={() => { setBusca(""); setRegiao("todos"); }} className="hs-text-button">Ver todos os implantes <ArrowRight size={13} /></button>}</div>}
        </div>
      </div>
    </div>
    {registro && <JanelaEscalpo titulo={registro.nome} onFechar={() => setAberto(null)}><FichaItemConteudo p={pecaEscalpo(registro, api)} voltar={() => setAberto(null)} /><AcoesEscalpo registro={registro} api={api} onConcluir={() => setAberto(null)} /></JanelaEscalpo>}
    {catalogoAberto && <JanelaMercado titulo="Catálogo de escalpos" onFechar={() => setCatalogoAberto(false)}>{fechar => <CatalogoEscalpos api={api} onFechar={fechar} />}</JanelaMercado>}
    {guia && <JanelaEscalpo titulo="Guia de escalpos" onFechar={() => setGuia(false)}><div className="hs-guide"><button type="button" className="hx-ch-hex hx-fechar" aria-label="Fechar" onClick={() => setGuia(false)}><X size={15} /></button><h2>Escalpos</h2><p>Corpo, máquina e runas. A Integridade, definida pelo Ânimo, mede a capacidade de suportar os implantes.</p><h3>Instalação</h3><p>Exige um biomecânico e normalmente leva 1 hora. O serviço já está incluído quando oferecido pela clínica. Caso contrário, a referência é 20% do preço.</p><h3>Módulos</h3><p>Ocupam espaços próprios no implante e normalmente não reduzem a Integridade. Possuir um módulo não significa que esteja instalado.</p><h3>Desgaste</h3><p><b>1 · Danificado:</b> funções especiais e módulos ficam inativos; funções naturais permanecem.</p><p><b>2 · Inativo:</b> deixa de funcionar completamente, inclusive como substituto de uma parte natural.</p><h3>Reparo</h3><p>Cada ponto exige um biomecânico: normalmente 1 hora e cerca de 10% do preço. Descansos não removem Desgaste. Gás arcano e manutenção cotidiana fazem parte da rotina.</p></div></JanelaEscalpo>}
  </div></section>;
}

function pecaEscalpo(registro: Registro, api: EscalposApi): PecaHud {
  const { modelo, instancia } = registro, dados = dadosEscalpo(modelo), r = regiaoEscalpo(modelo), Icon = ICONES[r.id];
  const requisitos = formatTechnicalContentField(modelo?.requisitos);
  const modulos = modelo ? [...api.catalogo.values()].filter(m => m.categoria === "modulo_escalpo" && marketEscalpoParents(m, api.catalogo).includes(modelo.slug)) : [];
  return {
    id: registro.id, nome: registro.nome, categoria: "escalpo", categoriaRotulo: r.nome, vertente: "nenhuma", raridade: modelo?.raridadeLabel ?? modelo?.raridade, onde: "equipado", espacos: dados.espacos ?? 0,
    identificacao: <span className="hs-ficha-badge"><span>{instancia ? "Instalado" : "Catálogo"}</span><b>{custo(dados.integridade)} <small>INT</small></b></span>,
    icone: <Icon size={52} strokeWidth={1.2} color={COR} style={{ filter: `drop-shadow(0 0 12px ${COR})` }} />,
    linhas: [
      { rotulo: "Integridade", valor: dados.integridade == null ? "Não informada" : dados.integridade === 0 ? "Sem redução" : `${custo(dados.integridade)} ao instalar` },
      ...(dados.modulos == null ? [] : [{ rotulo: "Módulos", valor: `${dados.modulos} ${dados.modulos === 1 ? "espaço" : "espaços"}` }]),
      ...(modelo?.preco == null ? [] : [{ rotulo: "Preço base", valor: moeda(modelo.preco) }]),
      ...dados.linhas.map(([k,v]) => ({ rotulo: k, valor: String(v) })),
      ...(requisitos ? [{ rotulo: "Requisitos", valor: requisitos }] : []),
    ],
    descricao: <><TextoComRegras texto={dados.descricao || modelo?.descricaoCurta || "Modelo indisponível. O registro de instalação está preservado."} glossario={api.glossario} />
      {modulos.length > 0 && <section className="hs-modules"><h3>Módulos compatíveis <small>{modulos.length}</small></h3>{modulos.map(m => {
        const quantidade = (api.character.inventario ?? []).filter(i => i.itemSlug === m.slug).reduce((s,i) => s + i.quantidade, 0);
        return <details key={m.slug}><summary><Layers size={14} /><span>{m.nome}{quantidade > 0 && <small>{quantidade} no inventário</small>}</span><ChevronDown size={13} /></summary><div><TextoComRegras texto={itemDescription(m)} glossario={api.glossario} /><p className="hs-module-price">{m.preco == null ? "Preço não informado" : moeda(m.preco)}</p></div></details>;
      })}<p className="hs-muted">Opções do catálogo; confirme os módulos instalados com o narrador.</p></section>}
      {instancia && <details className="hs-record"><summary>Registro de instalação <ChevronDown size={13} /></summary>{Number.isFinite(Date.parse(instancia.instaladoEm)) && <p>Instalado em {new Date(instancia.instaladoEm).toLocaleDateString("pt-BR")}.</p>}<p className="hs-muted">Desgaste e módulos instalados não estão registrados nesta ficha.</p>{instancia.notas && <TextoComRegras texto={instancia.notas} glossario={api.glossario} />}{api.escalpos.comEfeitoAutomatico.has(instancia.id) && <p>Modificador passivo aplicado nas rolagens.</p>}</details>}
    </>,
  };
}

function AcoesEscalpo({ registro, api, onConcluir }: { registro: Registro; api: EscalposApi; onConcluir: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  if (api.somenteLeitura || (!registro.instancia && !registro.modelo)) return null;
  const remover = !!registro.instancia;
  return <footer className="hs-actions">
    {confirmando ? <><p>{remover ? "Remover o registro e seus modificadores automáticos?" : "O procedimento já foi realizado? O registro não compra o implante, não retira itens do inventário e não ajusta a Integridade atual."}</p><div><button type="button" className="hs-back" onClick={() => setConfirmando(false)}><ArrowLeft size={14} /> Voltar</button><button type="button" className="cm-aprender" onClick={() => { if (remover) api.escalpos.remover(registro.instancia!.id); else api.escalpos.instalar(registro.modelo!.slug); onConcluir(); setConfirmando(false); }}>{remover ? "Confirmar remoção" : "Confirmar instalação"}</button></div></>
    : <button type="button" className={remover ? "hs-remove" : "cm-aprender"} onClick={() => setConfirmando(true)}>{remover ? <Trash2 size={14} /> : <Wrench size={14} />}{remover ? "Remover instalação" : "Registrar instalação"}</button>}
  </footer>;
}

/** Mesma casca, grade, filtros e ficha lateral do catálogo de Magias. */
function CatalogoEscalpos({ api, onFechar }: { api: EscalposApi; onFechar: () => void }) {
  const [regiao, setRegiao] = useState("todos"), [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null), [detalhe, setDetalhe] = useState(false);
  const catalogo = api.escalpos.catalogo.filter(e => e.status === "published");
  const visiveis = catalogo.filter(e => (regiao === "todos" || regiaoEscalpo(e).id === regiao) && normalizarEscalpo(`${e.nome} ${e.descricaoCurta ?? ""}`).includes(normalizarEscalpo(busca.trim())));
  const alvo = visiveis.find(e => e.slug === selecionado) ?? visiveis[0];
  const instalados = api.character.escalpos_instalados ?? [];
  const escolherRegiao = (id: string) => { setRegiao(id); setSelecionado(null); setDetalhe(false); };
  const registro = alvo ? { id: alvo.slug, nome: alvo.nome, modelo: alvo } : null;
  return <div className={`hx cm-janela hs-catalog ${oxanium.variable}`} data-detalhe={detalhe || undefined} style={{ ["--cm-cor" as string]: COR, ["--cm-item-cor" as string]: COR }}>
    <header className="cm-cabecalho"><div><span className="hx-mono cm-sobretitulo">// Arquivo de implantes</span><h2 className="hx-display">Catálogo de escalpos<span>.</span></h2></div><button type="button" className="hx-fechar-quad cm-fechar" aria-label="Fechar catálogo de escalpos" onClick={onFechar}><X size={16} /></button></header>
    <div className="cm-corpo"><nav className="cm-vertentes" aria-label="Categorias de escalpos"><button type="button" className="cm-vertente" aria-pressed={regiao === "todos"} onClick={() => escolherRegiao("todos")}><span className="cm-fio" /><Cpu size={18} /><span>Todos</span><small>{catalogo.length}</small></button>{REGIOES_ESCALPOS.filter(r => catalogo.some(e => regiaoEscalpo(e).id === r.id)).map(r => { const Icon = ICONES[r.id]; return <button type="button" key={r.id} className="cm-vertente" aria-pressed={regiao === r.id} onClick={() => escolherRegiao(r.id)}><span className="cm-fio" /><Icon size={18} /><span>{r.nome}</span><small>{catalogo.filter(e => regiaoEscalpo(e).id === r.id).length}</small></button>; })}</nav>
      <div className="cm-catalogo"><div className="cm-busca-faixa"><label className="cm-busca"><Search size={15} /><input type="search" aria-label="Buscar escalpo no catálogo" placeholder="Buscar escalpo ou efeito…" value={busca} onChange={e => { setBusca(e.target.value); setDetalhe(false); }} /></label></div><div className="cm-lista">{REGIOES_ESCALPOS.map(r => { const grupo = visiveis.filter(e => regiaoEscalpo(e).id === r.id), Icon = ICONES[r.id]; if (!grupo.length) return null; return <section key={r.id}><div className="cm-secao"><Icon size={16} /><span className="hx-display">{r.nome}</span><small>{grupo.length}</small><span className="cm-traco" /></div><div className="cm-grade">{grupo.map(e => <button type="button" key={e.slug} className="cm-carta" aria-label={`Ver ${e.nome}`} aria-pressed={alvo?.slug === e.slug} onClick={() => { setSelecionado(e.slug); setDetalhe(true); }}><span className="cm-carta-arte"><Icon size={32} strokeWidth={1.3} /></span><span className="cm-carta-info"><strong className="hx-display">{e.nome}</strong><span className="cm-carta-meta">{custo(dadosEscalpo(e).integridade)} INT <span>{instalados.some(i => i.contentId === e.slug) ? <><Check size={12} /> Instalado</> : e.preco == null ? "—" : moeda(e.preco)}</span></span></span></button>)}</div></section>; })}{!visiveis.length && <p className="cm-vazio">{api.escalpos.erro ? "Catálogo indisponível." : "Nenhum escalpo corresponde à busca."}</p>}</div></div>
      <aside className="cm-detalhe" aria-label="Detalhes do escalpo">{registro ? <><div className="cm-detalhe-voltar"><button type="button" onClick={() => setDetalhe(false)}>← Voltar ao catálogo</button></div><FichaItemConteudo key={registro.id} p={pecaEscalpo(registro, api)} /><AcoesEscalpo key={`acao:${registro.id}`} registro={registro} api={api} onConcluir={() => { /* Mantém o catálogo aberto, como ao aprender magias. */ }} /></> : <p className="cm-vazio">Selecione um escalpo para consultar seus detalhes.</p>}</aside>
    </div>
  </div>;
}

/** Ficha chanfrada compartilhada com Equipamento e Inventário; Escape e foco ficam no dossiê. */
function JanelaEscalpo({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  useEffect(() => {
    const el = ref.current, origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el?.querySelector<HTMLButtonElement>("button")?.focus();
    const teclado = (event: KeyboardEvent) => {
      if (document.body.classList.contains("rc-livro-por-cima")) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); fecharRef.current(); }
      if (event.key !== "Tab" || !el) return;
      const alvos = [...el.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, summary, [tabindex="0"]')].filter(e => e.getClientRects().length > 0);
      const primeiro = alvos[0], ultimo = alvos[alvos.length - 1];
      if (!el.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? ultimo : primeiro)?.focus(); }
      else if (event.shiftKey && document.activeElement === primeiro) { event.preventDefault(); ultimo?.focus(); }
      else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primeiro?.focus(); }
    };
    window.addEventListener("keydown", teclado, true);
    return () => { window.removeEventListener("keydown", teclado, true); origem?.focus(); };
  }, []);
  return createPortal(<div className={`hx hs-backdrop ${oxanium.variable}`} onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}><div ref={ref} role="dialog" aria-modal="true" aria-label={titulo} className="hs-dialog hx-edge hx-ch hx-pop"><div className="hs-dialog-inner hx-ch">{children}</div></div></div>, document.body);
}
