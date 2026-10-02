"use client";

/**
 * FORJA DE REFRATÁRIO — a criação de personagem desenhada no Figma
 * ("High-Fidelity Character Creator Exploration"), portada para o app.
 *
 * O visual e o motion são os do protótipo, com as cores e o CSS do app
 * (`forja.css`). Por baixo, o motor `useCriacao`: um `DraftV12` (o mesmo
 * formato do rascunho do servidor), as pendências da v1.2 e o salvamento.
 * Fases 2 e 3 do plano (`docs/prd/PLANO_FORJA_DE_REFRATARIO.md`): regras
 * da v1.2 e rascunho. O Selar e a troca do assistente da mesa são a Fase 4.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CatalogosCriacaoV12 } from "../_acoes/criacaoV12Actions";
import { RANKINGS_V12, resolveClassResourceV12, type AttributeIdV12, type ClassContentV12, type DraftV12, type RegiaoIdV12 } from "../../../../../lib/rulesetV12";
import { REGIOES } from "./acervo/regioes";
import { CLASSES_ACERVO } from "./acervo/classes";
import { VERTENTES_ACERVO } from "./acervo/vertentes";
import { Carrossel } from "./Carrossel";
import { Holograma } from "./Holograma";
import { Key, Mono, Panel, Seg } from "./ui";
import { oxanium } from "./fonte";
import { AVATAR_PADRAO, PASSOS, RANKING_INICIAL, type SetDraft } from "./tipos";
import { PASSO_DO_CAMPO, useCriacao, type Criacao } from "./useCriacao";
import { RegiaoLateral } from "./passos/Regiao";
import { ClasseLateral } from "./passos/Classe";
import { VertenteLateral } from "./passos/Vertente";
import { Antecedente, FichaTracos, OrigemNarrativa, Tracos } from "./passos/Trajetoria";
import { Pericias, PericiasLateral, SemClasse } from "./passos/Pericias";

export interface ForjaProps {
  catalogos: CatalogosCriacaoV12;
  /** Região onde a campanha começa: define o segundo idioma conhecido. */
  regiaoCampanha?: RegiaoIdV12;
  /** Nome da mesa no topo. */
  nomeMesa?: string;
  /** Sigla de quem narra, no selo do topo. */
  siglaNarrador?: string;
  /** Mesa onde o rascunho é salvo. Sem ela (prévia), nada é lido nem gravado. */
  campaignId?: string;
  /** Ranking em que o personagem começa. Hoje sempre F. */
  rankingInicial?: string;
}

const ATRIBUTOS: Array<{ id: AttributeIdV12; nome: string; desc: string }> = [
  { id: "corpo", nome: "Corpo", desc: "Força, resistência e reflexo." },
  { id: "mente", nome: "Mente", desc: "Raciocínio, percepção e técnica." },
  { id: "animo", nome: "Ânimo", desc: "Vontade, presença e conexão." },
];

export function Forja({ catalogos, regiaoCampanha = "beldran", nomeMesa = "Cinzas de Beldran · S14", siglaNarrador = "MJ", campaignId, rankingInicial = RANKING_INICIAL }: ForjaProps) {
  const [started, setStarted] = useState(false);
  const c = useCriacao({ catalogos, regiaoCampanha, campaignId });
  const { d, set, passo } = c;
  const [view, setView] = useState({ regiao: d.regiaoId as string, classe: CLASSES_ACERVO[0].id, vertente: VERTENTES_ACERVO[0].id as string });
  const onView = (k: keyof typeof view) => (id: string) => setView((v) => ({ ...v, [k]: id }));

  const classe = catalogos.classes.find((x) => x.slug === d.classeSlug);
  const vt = VERTENTES_ACERVO.find((v) => v.id === d.vertente);
  const reg = REGIOES.find((r) => r.id === d.regiaoId);
  const nomeAntecedente = catalogos.antecedentes.find((a) => a.slug === d.antecedenteId)?.nome;
  const vars = { "--vc": vt?.cor ?? "var(--fj-cy)", "--vc-brilho": vt?.brilho ?? "var(--fj-cy)" } as CSSProperties;

  // A prévia do avatar é um `blob:` em memória: solta a anterior ao trocar
  // e a última ao sair. (O avatar segue as regras do VTT na Fase 4.)
  const [avatar, setAvatar] = useState(AVATAR_PADRAO);
  const avatarLocal = useRef<string | null>(null);
  useEffect(() => () => { if (avatarLocal.current) URL.revokeObjectURL(avatarLocal.current); }, []);
  const trocarAvatar = (f: File) => {
    if (avatarLocal.current) URL.revokeObjectURL(avatarLocal.current);
    avatarLocal.current = URL.createObjectURL(f);
    setAvatar(avatarLocal.current);
  };

  const raiz = `fj-root ${oxanium.variable} mo-scope fj-forja`;
  if (!started) return <div style={vars} className={raiz}><Titulo onStart={() => setStarted(true)} nomeMesa={nomeMesa} /></div>;

  const cur = PASSOS[passo];
  const status = !c.persiste ? "" : c.conflito ? "Salvamento pausado" : c.salvando ? "Salvando…" : c.temRascunhoSalvo ? "Rascunho salvo" : "";
  return (
    <div style={vars} className={raiz}>
      {/* o mundo ao fundo reage à região */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {reg && <img key={reg.id} src={reg.img} alt="" className="fj-boot fj-palco__fundo" />}
      <div className="fj-palco__veu" />
      <div className="fj-palco__tinta" />
      <div className="fj-hexgrid fj-palco__grade" />
      <div className="fj-scan fj-cobre fj-palco__scan" />

      <div className="fj-palco">
        <BarraTopo group={cur.group} label={cur.label} onExit={() => setStarted(false)} nomeMesa={nomeMesa} siglaNarrador={siglaNarrador} status={status} />

        <div className="fj-sem-barra fj-grade">
          <MenuLateral step={passo} setStep={c.irPara} completos={c.passosCompletos} />
          <main key={passo} className="fj-boot fj-centro">
            {centro({ c, catalogos, classe, view, onView, avatar, trocarAvatar, nomeAntecedente })}
          </main>
          <aside className="fj-sem-barra fj-lateral">
            <PlacaIdentidade d={d} avatar={avatar} progress={c.sincronia} ranking={rankingInicial} />
            {c.aviso && (
              <div className="fj-aviso" role="status">
                <span>{c.aviso}</span>
                <button type="button" onClick={c.dispensarAviso} aria-label="Dispensar aviso">✕</button>
              </div>
            )}
            <div key={passo} className="fj-boot">{lateral({ c, catalogos, classe, view, regiaoCampanha })}</div>
          </aside>
        </div>

        <Doca step={passo} setStep={c.irPara} pendentes={c.pendencias.length} podeSelar={false} />
      </div>
    </div>
  );
}

function BarraTopo({ group, label, onExit, nomeMesa, siglaNarrador, status }: { group: string; label: string; onExit: () => void; nomeMesa: string; siglaNarrador: string; status: string }) {
  return (
    <header className="fj-topo">
      <button type="button" onClick={onExit} className="fj-topo__sair">
        <span className="fj-topo__sair-seta" aria-hidden="true">«</span> Sair da forja
      </button>
      <div className="fj-topo__placa">
        <div className="fj-ch-plate fj-topo__placa-corpo">
          <div className="fj-topo__grupo">{group}</div>
          <div className="fj-topo__passo fj-glow">{label}</div>
        </div>
        <div className="fj-topo__placa-fio" />
      </div>
      <div className="fj-topo__mesa">
        <div>
          <Mono>Mesa ativa</Mono>
          <div className="fj-topo__mesa-nome">{nomeMesa}</div>
          {status && <span className="fj-topo__status" aria-live="polite"><Mono pequeno tom="cy">{status}</Mono></span>}
        </div>
        <span className="fj-ch-hex fj-topo__narrador">{siglaNarrador}</span>
      </div>
    </header>
  );
}

function MenuLateral({ step, setStep, completos }: { step: number; setStep: (n: number) => void; completos: boolean[] }) {
  let last = "";
  return (
    <nav className="fj-menu" aria-label="Passos da forja">
      <div className="fj-ch-tab fj-menu__titulo fj-glow">Forja</div>
      <div className="fj-menu__lista">
        {PASSOS.map((s, i) => {
          const hdr = s.group !== last;
          last = s.group;
          const on = i === step;
          return (
            <div key={s.key}>
              {hdr && <div className="fj-menu__grupo"><Mono pequeno tom="cy">{s.group}</Mono><span className="fj-menu__grupo-fio" /></div>}
              <button type="button" onClick={() => setStep(i)} aria-current={on ? "step" : undefined} className={`fj-ch-tab fj-menu__passo ${on ? "fj-menu__passo--atual" : ""}`}>
                {on && <span className="fj-menu__sublinhado" />}
                <span className="fj-menu__n">0{i + 1}</span>
                <span className="fj-menu__rotulo">{s.label}</span>
                <span className={`fj-menu__estado ${completos[i] ? "fj-menu__estado--feito" : ""}`} aria-label={completos[i] ? "concluído" : "pendente"} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="fj-menu__aviso">
        <Panel ambar title="Aviso">
          <p className="fj-menu__aviso-texto">Registro não selado. Refratários sem RPI forjado não podem entrar na mesa.</p>
          <div className="fj-hazard-a fj-menu__aviso-faixa" />
        </Panel>
      </div>
    </nav>
  );
}

function PlacaIdentidade({ d, avatar, progress, ranking }: { d: DraftV12; avatar: string; progress: number; ranking: string }) {
  return (
    <div>
      <div className="fj-placa">
        <div className="fj-ch-l fj-placa__corpo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="fj-ch-hex fj-placa__avatar"><img src={avatar} alt="" /></span>
          <div className="fj-placa__texto">
            <div className="fj-placa__nome">{d.nome || "Sem nome"}</div>
            <Mono tom="cy">RPI #0417 · {d.codinome || "—"}</Mono>
          </div>
        </div>
        <div className="fj-placa__rank" aria-label={`Ranking ${ranking}`}>
          <span className="fj-placa__rank-rotulo">Rank</span>
          <span className="fj-placa__rank-valor fj-glow">{ranking}</span>
        </div>
      </div>
      <div className="fj-sincronia">
        <Mono>Sincronia</Mono>
        <div className="fj-sincronia__trilho" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Sincronia">
          <div className="fj-hazard fj-cobre" />
          <div className="fj-sincronia__barra" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="fj-sincronia__pct">{Math.round(progress * 100)}%</span>
      </div>
    </div>
  );
}

function Doca({ step, setStep, pendentes, podeSelar, onSelar }: { step: number; setStep: (n: number) => void; pendentes: number; podeSelar: boolean; onSelar?: () => void }) {
  return (
    <footer className="fj-doca">
      <button type="button" onClick={() => setStep(Math.max(0, step - 1))} className="fj-doca__voltar"><Key k="Q" /> Voltar</button>
      {step < PASSOS.length - 1 ? (
        <button type="button" onClick={() => setStep(step + 1)} className="fj-doca__avancar">
          <span className="fj-doca__confirmar">Confirmar</span>
          <span className="fj-ch fj-doca__proximo">{PASSOS[step + 1].label} ›</span>
          <Key k="E" />
        </button>
      ) : (
        <div className="fj-doca__selo">
          {pendentes > 0 && <Mono tom="am">{pendentes} pendência{pendentes > 1 ? "s" : ""}</Mono>}
          <button type="button" disabled={!podeSelar || pendentes > 0} onClick={onSelar} title={pendentes > 0 ? "Resolva as pendências da Revisão." : !podeSelar ? "O Selar cria o personagem dentro da mesa." : undefined} className="fj-ch fj-doca__selar">Selar refratário</button>
        </div>
      )}
    </footer>
  );
}

/* ================= TELA INICIAL ================= */
function Titulo({ onStart, nomeMesa }: { onStart: () => void; nomeMesa: string }) {
  const items: [string, string, boolean][] = [
    ["Novo refratário", "Iniciar protocolo de forja", true],
    ["Continuar rascunho", "Rascunho salvo nesta mesa", false],
    ["Importar registro", "Arquivo .rpi", false],
    ["Voltar à mesa", nomeMesa.split(" · ")[0], false],
  ];
  return (
    <div className="fj-titulo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="https://images.unsplash.com/photo-1672872476232-da16b45c9001?w=2000&h=1200&fit=crop&auto=format&q=80" alt="" className="fj-titulo__fundo" />
      <div className="fj-titulo__tinta" />
      <div className="fj-titulo__veu-lado" />
      <div className="fj-titulo__veu-base" />
      <div className="fj-scan fj-cobre" />
      <div className="fj-titulo__conteudo">
        <Mono tom="am">{"// ANOMALIA DETECTADA · NOVO SINAL REFRATÁRIO"}</Mono>
        <div className="fj-titulo__marca">
          <h1 className="fj-titulo__logo fj-glow">RUPTURA</h1>
          <span aria-hidden="true" className="fj-glitch fj-titulo__logo fj-titulo__logo--eco">RUPTURA</span>
        </div>
        <div className="fj-titulo__sub"><span className="fj-titulo__sub-fio" /><span className="fj-titulo__sub-texto">Forja de Refratário</span></div>
        <div className="fj-titulo__menu">
          {items.map(([t, s, primary], i) => (
            <button type="button" key={t} onClick={i < 2 ? onStart : undefined} className={`fj-ch-tab fj-titulo__item ${primary ? "fj-titulo__item--primario" : ""}`}>
              {primary && <span className="fj-titulo__item-sublinhado" />}
              <div><div className="fj-titulo__item-nome">{t}</div><Mono>{s}</Mono></div>
              <span className="fj-titulo__item-seta" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
        <div className="fj-titulo__dica"><Key k="ENTER" /><span className="fj-pulso">Pressione para iniciar</span></div>
      </div>
      <div className="fj-titulo__versao"><Mono>Build 0.1 · Concept</Mono><br /><Mono tom="cy">VTT · Sistema RUPTURA</Mono></div>
    </div>
  );
}

/* ================= CENTRO ================= */
type Vista = { regiao: string; classe: string; vertente: string };
interface Contexto {
  c: Criacao;
  catalogos: CatalogosCriacaoV12;
  classe?: ClassContentV12;
  view: Vista;
}

function centro({ c, catalogos, classe, view, onView, avatar, trocarAvatar, nomeAntecedente }: Contexto & {
  onView: (k: keyof Vista) => (id: string) => void;
  avatar: string;
  trocarAvatar: (f: File) => void;
  nomeAntecedente?: string;
}): ReactNode {
  const { d, set } = c;
  switch (c.passo) {
    case 0: return (
      <div className="fj-conceito">
        <label className="fj-conceito__avatar">
          <Holograma d={d} avatar={avatar} progress={c.sincronia} nomeAntecedente={nomeAntecedente} />
          <span className="fj-conceito__carregar"><Key k="U" /> Carregar avatar</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" className="fj-sr" onChange={(e) => { const f = e.target.files?.[0]; if (f) trocarAvatar(f); }} />
        </label>
        <Mono>Avatar enviado pelo jogador · projetado como registro holográfico</Mono>
      </div>
    );
    case 1: return <Carrossel items={REGIOES.map((r) => ({ id: r.id, nome: r.nome, img: r.img, top: `CAPITAL · ${r.capital.toUpperCase()}`, sub: r.tag, color: r.tint }))} value={d.regiaoId} viewId={view.regiao} onView={onView("regiao")} onPick={(id) => set({ regiaoId: id, localOrigem: id === d.regiaoId ? d.localOrigem : "" })} cta="Fixar origem" />;
    case 2: return <Antecedente d={d} set={set} catalogos={catalogos} />;
    case 3: return <Tracos d={d} set={set} catalogos={catalogos} />;
    case 4: return <Carrossel items={CLASSES_ACERVO.filter((x) => catalogos.classes.some((k) => k.slug === x.id)).map((x) => ({ id: x.id, nome: x.nome, img: x.arte, top: `CLASSE · ${x.sigla}`, sub: x.papel }))} value={d.classeSlug} viewId={view.classe} onView={onView("classe")} onPick={c.trocarClasse} cta="Assumir classe" />;
    case 5: return <Atributos d={d} set={set} classe={classe} avatar={avatar} progress={c.sincronia} nomeAntecedente={nomeAntecedente} irParaClasse={() => c.irPara(4)} />;
    case 6: return <Pericias d={d} set={set} catalogos={catalogos} classe={classe} irParaClasse={() => c.irPara(4)} />;
    case 7: return <Carrossel items={VERTENTES_ACERVO.map((v) => ({ id: v.id, nome: v.nome, img: v.arte, top: "VERTENTE PRIMÁRIA", sub: v.frase.split(".")[0], color: v.cor }))} value={d.vertente} viewId={view.vertente} onView={onView("vertente")} onPick={(id) => set({ vertente: id })} cta="Sintonizar" />;
    default: return <div className="fj-revisao-centro"><Holograma d={d} avatar={avatar} progress={1} solid nomeAntecedente={nomeAntecedente} /></div>;
  }
}

/**
 * Atributos pela regra da v1.2: um perfil da Classe (ex.: 3 · 1 · 0)
 * distribuído entre Corpo, Mente e Ânimo. Escolher o perfil já distribui;
 * − e + trocam o valor com o atributo que tem o vizinho, então a
 * distribuição está sempre completa e sempre válida.
 */
function Atributos({ d, set, classe, avatar, progress, nomeAntecedente, irParaClasse }: { d: DraftV12; set: SetDraft; classe?: ClassContentV12; avatar: string; progress: number; nomeAntecedente?: string; irParaClasse: () => void }) {
  if (!classe) return <SemClasse irParaClasse={irParaClasse} oque="Os valores de Atributos" />;
  const perfis = classe.criacao.perfis_atributos;
  const perfil = perfis.find((p) => p.slug === d.perfilAtributos);
  const escolherPerfil = (slug: string) => {
    const p = perfis.find((x) => x.slug === slug);
    if (!p) return;
    set({ perfilAtributos: slug, atributos: { corpo: p.valores[0], mente: p.valores[1], animo: p.valores[2] } });
  };
  const trocar = (alvo: AttributeIdV12, dir: 1 | -1) => {
    if (!perfil) return;
    const atual = d.atributos[alvo];
    if (atual === null) return;
    const distintos = [...new Set(perfil.valores)].sort((a, b) => a - b);
    const vizinho = distintos[distintos.indexOf(atual) + dir];
    if (vizinho === undefined) return;
    const outro = ATRIBUTOS.find((a) => a.id !== alvo && d.atributos[a.id] === vizinho);
    if (!outro) return;
    set({ atributos: { ...d.atributos, [alvo]: vizinho, [outro.id]: atual } });
  };
  const no = (i: number) => {
    const a = ATRIBUTOS[i];
    const v = d.atributos[a.id];
    const distintos = perfil ? [...new Set(perfil.valores)].sort((x, y) => x - y) : [];
    return (
      <NoAtributo
        valor={v}
        name={a.nome}
        desc={a.desc}
        podeMenos={v !== null && distintos.indexOf(v) > 0}
        podeMais={v !== null && distintos.indexOf(v) < distintos.length - 1}
        onBump={(dir) => trocar(a.id, dir)}
      />
    );
  };
  return (
    <div className="fj-atributos">
      <div className="fj-atributos__linha">
        <div className="fj-atributos__esq">{no(0)}</div>
        <Holograma d={d} avatar={avatar} progress={progress} size="md" nomeAntecedente={nomeAntecedente} />
        <div className="fj-atributos__dir">{no(1)}</div>
      </div>
      <div className="fj-atributos__linha fj-atributos__linha--base">
        <div className="fj-atributos__perfis" role="radiogroup" aria-label="Perfil de Atributos">
          <Mono>Perfil · {classe.nome}</Mono>
          {perfis.map((p) => {
            const on = p.slug === d.perfilAtributos;
            return (
              <button type="button" role="radio" aria-checked={on} key={p.slug} onClick={() => escolherPerfil(p.slug)} className={`fj-ch-tab fj-perfil fj-perfil--compacto ${on ? "fj-perfil--on" : ""}`}>
                <span className="fj-perfil__nome">{p.nome}</span>
                <span className="fj-perfil__valores">{p.valores.join(" · ")}</span>
              </button>
            );
          })}
        </div>
        <div className="fj-atributos__meio">{no(2)}</div>
        <div />
      </div>
    </div>
  );
}

function NoAtributo({ valor, onBump, name, desc, podeMenos, podeMais }: { valor: number | null; onBump: (d: 1 | -1) => void; name: string; desc: string; podeMenos: boolean; podeMais: boolean }) {
  return (
    <div className="fj-atributo">
      <Panel title={name}>
        <p className="fj-atributo__desc">{desc}</p>
        <div className="fj-atributo__controle">
          <button type="button" disabled={!podeMenos} onClick={() => onBump(-1)} className="fj-ch fj-atributo__btn" aria-label={`Diminuir ${name}`}>−</button>
          <span key={valor ?? "x"} className="fj-boot fj-atributo__valor fj-glow">{valor ?? "–"}</span>
          <button type="button" disabled={!podeMais} onClick={() => onBump(1)} className="fj-ch fj-atributo__btn fj-atributo__btn--mais" aria-label={`Aumentar ${name}`}>+</button>
        </div>
        <div className="fj-atributo__seg"><Seg value={valor ?? 0} max={3} /></div>
      </Panel>
    </div>
  );
}

/* ================= PAINEL LATERAL ================= */
const RECURSOS: Array<{ id: string; nome: string; base: string }> = [
  { id: "pv", nome: "PV", base: "CORPO" },
  { id: "pe", nome: "PE", base: "MENTE" },
  { id: "mana", nome: "Mana", base: "ÂNIMO" },
  { id: "integridade", nome: "Integridade", base: "ÂNIMO" },
  { id: "reacoes", nome: "Reações", base: "MENTE" },
  { id: "andar", nome: "Andar", base: "CORPO" },
  { id: "correr", nome: "Correr", base: "CORPO" },
];

function lateral({ c, catalogos, classe, view, regiaoCampanha }: Contexto & { regiaoCampanha: RegiaoIdV12 }): ReactNode {
  const { d, set, forja, setForja } = c;
  switch (c.passo) {
    case 0: return (
      <Panel title="Identidade">
        <div className="fj-identidade">
          <label className="fj-campo"><Mono>Nome</Mono><input value={d.nome} onChange={(e) => set({ nome: e.target.value })} className="fj-campo__input fj-campo__input--nome" /></label>
          <label className="fj-campo"><Mono>Codinome</Mono><input value={d.codinome} onChange={(e) => set({ codinome: e.target.value.toUpperCase() })} className="fj-campo__input fj-campo__input--codinome" /></label>
          <label className="fj-campo"><Mono>Ideia geral</Mono><textarea rows={3} value={forja.conceito} onChange={(e) => setForja({ conceito: e.target.value })} className="fj-campo__input fj-campo__input--area" /></label>
          <label className="fj-campo"><Mono>Aparência</Mono><textarea rows={3} value={forja.aparencia} onChange={(e) => setForja({ aparencia: e.target.value })} className="fj-campo__input fj-campo__input--area fj-campo__input--suave" /></label>
        </div>
      </Panel>
    );
    case 1: return <RegiaoLateral d={d} set={set} id={view.regiao} regiaoCampanha={regiaoCampanha} />;
    case 2: return <OrigemNarrativa d={d} set={set} forja={forja} setForja={setForja} />;
    case 3: return <FichaTracos d={d} set={set} catalogos={catalogos} />;
    case 4: return <ClasseLateral d={d} escolher={c.trocarClasse} id={view.classe} />;
    case 5: {
      if (!classe) return null;
      const completos = d.atributos.corpo !== null && d.atributos.mente !== null && d.atributos.animo !== null;
      const atr = completos ? (d.atributos as Record<AttributeIdV12, number>) : null;
      return (
        <Panel title="Recursos iniciais" right={<Mono tom="cy">{classe.nome}</Mono>}>
          {atr ? (
            <div className="fj-recursos">
              {RECURSOS.map((r) => {
                const formula = classe.criacao.recursos[r.id];
                const v = resolveClassResourceV12(classe, r.id, atr);
                if (!formula || v === undefined) return null;
                const max = formula.constante + 3 * (formula.multiplicador_atributo ?? (formula.atributo ? 1 : 0));
                return (
                  <div key={r.id} className="fj-recurso">
                    <div className="fj-ch-l fj-recurso__moldura">
                      <div className="fj-recurso__topo"><span className="fj-recurso__nome">{r.nome}</span><Mono tom="cy">{formula.texto ?? r.base}</Mono></div>
                      <div className="fj-recurso__trilho"><div className="fj-recurso__barra" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /><span className="fj-recurso__valor">{v}</span></div>
                    </div>
                  </div>
                );
              })}
              <p className="fj-recursos__nota">PA no Ranking {RANKINGS_V12[0]}: {classe.progressao[RANKINGS_V12[0]]?.pa ?? "—"}</p>
            </div>
          ) : <p className="fj-recursos__nota">Escolha um perfil para ver os recursos.</p>}
        </Panel>
      );
    }
    case 6: return <PericiasLateral classe={classe} catalogos={catalogos} />;
    case 7: return <VertenteLateral d={d} set={set} id={view.vertente} />;
    default: return <Revisao c={c} catalogos={catalogos} classe={classe} />;
  }
}

function Revisao({ c, catalogos, classe }: { c: Criacao; catalogos: CatalogosCriacaoV12; classe?: ClassContentV12 }) {
  const { d, forja } = c;
  const nomes = (lista: { slug: string; nome: string }[], escolhas: DraftV12["qualidades"]) => escolhas.map((e) => `${lista.find((x) => x.slug === e.id)?.nome ?? e.id} (${e.pontos})`).join(", ");
  const regiao = REGIOES.find((r) => r.id === d.regiaoId)?.nome ?? "";
  const pericias = ([3, 2, 1] as const)
    .map((v) => Object.entries(d.pericias).filter(([, x]) => x === v).map(([id]) => catalogos.pericias.find((p) => p.id === id)?.nome ?? id))
    .map((l, i) => (l.length ? `${3 - i}: ${l.join(", ")}` : ""))
    .filter(Boolean)
    .join(" · ");
  const rows: [string, string][] = [
    ["Região", d.localOrigem ? `${regiao} · ${d.localOrigem}` : ""],
    ["Antecedente", catalogos.antecedentes.find((x) => x.slug === d.antecedenteId)?.nome ?? ""],
    ["Qualidades", nomes(catalogos.qualidades, d.qualidades)],
    ["Complicações", nomes(catalogos.complicacoes, d.complicacoes)],
    ["Classe", classe?.nome ?? ""],
    ["Corpo · Mente · Ânimo", d.atributos.corpo === null ? "" : [d.atributos.corpo, d.atributos.mente, d.atributos.animo].join(" · ")],
    ["Perícias", pericias],
    ["Vertente", VERTENTES_ACERVO.find((x) => x.id === d.vertente)?.nome ?? ""],
  ];
  return (
    <div className="fj-pilha">
      <Panel title="Registro final" right={<Mono tom="cy">RPI #0417</Mono>}>
        {forja.conceito && <p className="fj-revisao__conceito">“{forja.conceito}”</p>}
        {rows.map(([k, v]) => (
          <div key={k} className="fj-revisao__linha">
            <Mono>{k}</Mono>
            <span className={`fj-revisao__valor ${v ? "" : "fj-revisao__valor--pendente"}`}>{v || "⚠ Pendente"}</span>
          </div>
        ))}
        <p className="fj-revisao__nota">Magias iniciais e equipamento ficam para depois da criação.</p>
      </Panel>
      {c.pendencias.length > 0 && (
        <Panel ambar title="Pendências" right={<span className="fj-ficha-tracos__sobra fj-ficha-tracos__sobra--escuro">{c.pendencias.length}</span>}>
          <ul className="fj-pendencias">
            {c.pendencias.map((p) => (
              <li key={p.texto}>
                <button type="button" onClick={() => c.irPara(PASSO_DO_CAMPO[p.campo])} className="fj-pendencias__item">
                  <span className="fj-pendencias__passo">{PASSOS[PASSO_DO_CAMPO[p.campo]].label}</span>
                  <span>{p.texto}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
