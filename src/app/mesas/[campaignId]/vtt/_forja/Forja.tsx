"use client";

/**
 * FORJA DE REFRATÁRIO — a criação de personagem desenhada no Figma
 * ("High-Fidelity Character Creator Exploration"), portada para o app.
 *
 * Fase 1 do plano (`docs/prd/PLANO_FORJA_DE_REFRATARIO.md`): o visual e
 * o motion do protótipo com as cores e o CSS do app (`forja.css`). A
 * Trajetória já lê o catálogo canônico da v1.2 (`CatalogosCriacaoV12`);
 * a mecânica de atributos e magias ainda é a do protótipo até a Fase 3,
 * e o Selar ainda não cria personagem (Fase 4). Por isso ela vive em
 * `/dev/forja` e ainda não substitui o assistente da mesa.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CatalogosCriacaoV12 } from "../_acoes/criacaoV12Actions";
import type { RegiaoIdV12 } from "../../../../../lib/rulesetV12/contracts";
import { REGIOES } from "./acervo/regioes";
import { CLASSES_ACERVO } from "./acervo/classes";
import { VERTENTES_ACERVO } from "./acervo/vertentes";
import { Carrossel } from "./Carrossel";
import { Holograma } from "./Holograma";
import { Key, Mono, Panel, Seg } from "./ui";
import { oxanium } from "./fonte";
import { AVATAR_PADRAO, PASSOS, type Build, type SetBuild } from "./tipos";
import { RegiaoLateral } from "./passos/Regiao";
import { ClasseLateral } from "./passos/Classe";
import { VertenteLateral, magiasIniciais } from "./passos/Vertente";
import { Antecedente, FichaTracos, OrigemNarrativa, Tracos } from "./passos/Trajetoria";

export interface ForjaProps {
  catalogos: CatalogosCriacaoV12;
  /** Região onde a campanha começa: define o segundo idioma conhecido. */
  regiaoCampanha?: RegiaoIdV12;
  /** Nome da mesa no topo. */
  nomeMesa?: string;
  /** Sigla de quem narra, no selo do topo. */
  siglaNarrador?: string;
}

const BUILD_INICIAL: Build = {
  avatar: AVATAR_PADRAO,
  nome: "Iara Voss",
  codinome: "VÉSPERA",
  conceito: "Ex-arquivista que viu o que não devia e agora carrega o arquivo dentro de si.",
  aparencia: "Cabelo tingido de verde, olhar cansado, casaco de chancelaria sem insígnias.",
  regiao: "beldran",
  local: "",
  antecedente: "",
  origem: "",
  qualidades: {},
  complicacoes: {},
  classe: "",
  atributos: [1, 1, 1],
  vertente: "",
  magias: [],
};

/**
 * Passo a passo, se está completo. UMA fonte para a Sincronia, os
 * losangos do menu e (na Fase 4) o Selar — antes eram duas contas
 * escritas à mão que podiam discordar. Critérios ainda do protótipo;
 * a Fase 3 troca pelos do servidor.
 */
export function passosCompletos(b: Build): boolean[] {
  const base = [
    !!b.nome.trim(),
    !!b.regiao,
    !!b.antecedente,
    Object.keys(b.qualidades).length > 0,
    !!b.classe,
    b.atributos.reduce((a, c) => a + c, 0) >= 9,
    !!b.vertente && b.magias.length === magiasIniciais(b.vertente),
  ];
  return [...base, base.every(Boolean)];
}

export function Forja({ catalogos, regiaoCampanha = "beldran", nomeMesa = "Cinzas de Beldran · S14", siglaNarrador = "MJ" }: ForjaProps) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [b, setB] = useState<Build>(BUILD_INICIAL);
  const set: SetBuild = useCallback((p) => setB((o) => ({ ...o, ...p })), []);
  const [view, setView] = useState({ regiao: "beldran", classe: CLASSES_ACERVO[0].id, vertente: VERTENTES_ACERVO[0].id });
  const onView = (k: keyof typeof view) => (id: string) => setView((v) => ({ ...v, [k]: id }));
  const completos = useMemo(() => passosCompletos(b), [b]);
  const progress = completos.slice(0, -1).filter(Boolean).length / (PASSOS.length - 1);

  const vt = VERTENTES_ACERVO.find((v) => v.id === b.vertente);
  const reg = REGIOES.find((r) => r.id === b.regiao);
  const nomeAntecedente = catalogos.antecedentes.find((a) => a.slug === b.antecedente)?.nome;
  const vars = { "--vc": vt?.cor ?? "var(--fj-cy)", "--vc-brilho": vt?.brilho ?? "var(--fj-cy)" } as CSSProperties;

  // A prévia do avatar é um `blob:` em memória: solta a anterior ao trocar
  // e a última ao sair, senão cada troca fica presa até fechar a aba.
  const avatarLocal = useRef<string | null>(null);
  useEffect(() => () => { if (avatarLocal.current) URL.revokeObjectURL(avatarLocal.current); }, []);
  const trocarAvatar = (f: File) => {
    if (avatarLocal.current) URL.revokeObjectURL(avatarLocal.current);
    avatarLocal.current = URL.createObjectURL(f);
    set({ avatar: avatarLocal.current });
  };

  const raiz = `fj-root ${oxanium.variable} mo-scope fj-forja`;
  if (!started) return <div style={vars} className={raiz}><Titulo onStart={() => setStarted(true)} nomeMesa={nomeMesa} /></div>;

  const cur = PASSOS[step];
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
        <BarraTopo group={cur.group} label={cur.label} onExit={() => setStarted(false)} nomeMesa={nomeMesa} siglaNarrador={siglaNarrador} />

        <div className="fj-sem-barra fj-grade">
          <MenuLateral step={step} setStep={setStep} completos={completos} />
          <main key={step} className="fj-boot fj-centro">
            {centro(step, b, set, progress, view, onView, catalogos, trocarAvatar, nomeAntecedente)}
          </main>
          <aside className="fj-sem-barra fj-lateral">
            <PlacaIdentidade b={b} progress={progress} step={step} />
            <div key={step} className="fj-boot">{lateral(step, b, set, view, catalogos, regiaoCampanha)}</div>
          </aside>
        </div>

        <Doca step={step} setStep={setStep} />
      </div>
    </div>
  );
}

function BarraTopo({ group, label, onExit, nomeMesa, siglaNarrador }: { group: string; label: string; onExit: () => void; nomeMesa: string; siglaNarrador: string }) {
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
        <div><Mono>Mesa ativa</Mono><div className="fj-topo__mesa-nome">{nomeMesa}</div></div>
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

function PlacaIdentidade({ b, progress, step }: { b: Build; progress: number; step: number }) {
  return (
    <div>
      <div className="fj-placa">
        <div className="fj-ch-l fj-placa__corpo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="fj-ch-hex fj-placa__avatar"><img src={b.avatar} alt="" /></span>
          <div className="fj-placa__texto">
            <div className="fj-placa__nome">{b.nome || "Sem nome"}</div>
            <Mono tom="cy">RPI #0417 · {b.codinome || "—"}</Mono>
          </div>
        </div>
        <div className="fj-placa__passo fj-glow">{step + 1}</div>
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

function Doca({ step, setStep }: { step: number; setStep: (n: number) => void }) {
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
        <button type="button" className="fj-ch fj-doca__selar">Selar refratário</button>
      )}
    </footer>
  );
}

/* ================= TELA INICIAL ================= */
function Titulo({ onStart, nomeMesa }: { onStart: () => void; nomeMesa: string }) {
  const items: [string, string, boolean][] = [
    ["Novo refratário", "Iniciar protocolo de forja", true],
    ["Continuar rascunho", "Iara Voss · 38% sincronizado", false],
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
function centro(
  step: number, b: Build, set: SetBuild, progress: number, view: Vista, onView: (k: keyof Vista) => (id: string) => void,
  catalogos: CatalogosCriacaoV12, trocarAvatar: (f: File) => void, nomeAntecedente?: string,
): ReactNode {
  switch (step) {
    case 0: return (
      <div className="fj-conceito">
        <label className="fj-conceito__avatar">
          <Holograma b={b} progress={progress} nomeAntecedente={nomeAntecedente} />
          <span className="fj-conceito__carregar"><Key k="U" /> Carregar avatar</span>
          <input type="file" accept="image/*" className="fj-sr" onChange={(e) => { const f = e.target.files?.[0]; if (f) trocarAvatar(f); }} />
        </label>
        <Mono>Avatar enviado pelo jogador · projetado como registro holográfico</Mono>
      </div>
    );
    case 1: return <Carrossel items={REGIOES.map((r) => ({ id: r.id, nome: r.nome, img: r.img, top: `CAPITAL · ${r.capital.toUpperCase()}`, sub: r.tag, color: r.tint }))} value={b.regiao} viewId={view.regiao} onView={onView("regiao")} onPick={(id) => set({ regiao: id as RegiaoIdV12 })} cta="Fixar origem" />;
    case 2: return <Antecedente b={b} set={set} catalogos={catalogos} />;
    case 3: return <Tracos b={b} set={set} catalogos={catalogos} />;
    case 4: return <Carrossel items={CLASSES_ACERVO.map((c) => ({ id: c.id, nome: c.nome, img: c.arte, top: `CLASSE · ${c.sigla}`, sub: c.papel }))} value={b.classe} viewId={view.classe} onView={onView("classe")} onPick={(id) => set({ classe: id })} cta="Assumir classe" />;
    case 5: return <Atributos b={b} set={set} progress={progress} nomeAntecedente={nomeAntecedente} />;
    case 6: return <Carrossel items={VERTENTES_ACERVO.map((v) => ({ id: v.id, nome: v.nome, img: v.arte, top: "VERTENTE PRIMÁRIA", sub: v.frase.split(".")[0], color: v.cor }))} value={b.vertente} viewId={view.vertente} onView={onView("vertente")} onPick={(id) => set({ vertente: id as Build["vertente"], magias: b.vertente === id ? b.magias : [] })} cta="Sintonizar" />;
    default: return <div className="fj-revisao-centro"><Holograma b={b} progress={1} solid nomeAntecedente={nomeAntecedente} /></div>;
  }
}

function Atributos({ b, set, progress, nomeAntecedente }: { b: Build; set: SetBuild; progress: number; nomeAntecedente?: string }) {
  const left = 9 - b.atributos.reduce((a, c) => a + c, 0);
  const bump = (i: number, d: number) => {
    const v = b.atributos[i] + d;
    if (v < 1 || v > 4 || (d > 0 && left <= 0)) return;
    set({ atributos: b.atributos.map((x, j) => (j === i ? v : x)) as Build["atributos"] });
  };
  return (
    <div className="fj-atributos">
      <div className="fj-atributos__linha">
        <div className="fj-atributos__esq"><NoAtributo valor={b.atributos[0]} onBump={(d) => bump(0, d)} name="Corpo" desc="Força, resistência e reflexo." /></div>
        <Holograma b={b} progress={progress} size="md" nomeAntecedente={nomeAntecedente} />
        <div className="fj-atributos__dir"><NoAtributo valor={b.atributos[1]} onBump={(d) => bump(1, d)} name="Mente" desc="Raciocínio, percepção e técnica." /></div>
      </div>
      <div className="fj-atributos__linha fj-atributos__linha--base">
        <div className="fj-atributos__livres"><Mono>Pontos livres</Mono><div className="fj-atributos__livres-n">{left}</div></div>
        <div className="fj-atributos__meio"><NoAtributo valor={b.atributos[2]} onBump={(d) => bump(2, d)} name="Ânimo" desc="Vontade, presença e conexão." /></div>
        <div />
      </div>
    </div>
  );
}

function NoAtributo({ valor, onBump, name, desc }: { valor: number; onBump: (d: number) => void; name: string; desc: string }) {
  return (
    <div className="fj-atributo">
      <Panel title={name}>
        <p className="fj-atributo__desc">{desc}</p>
        <div className="fj-atributo__controle">
          <button type="button" onClick={() => onBump(-1)} className="fj-ch fj-atributo__btn" aria-label={`Diminuir ${name}`}>−</button>
          <span key={valor} className="fj-boot fj-atributo__valor fj-glow">{valor}</span>
          <button type="button" onClick={() => onBump(1)} className="fj-ch fj-atributo__btn fj-atributo__btn--mais" aria-label={`Aumentar ${name}`}>+</button>
        </div>
        <div className="fj-atributo__seg"><Seg value={valor} max={4} /></div>
      </Panel>
    </div>
  );
}

/* ================= PAINEL LATERAL ================= */
function lateral(step: number, b: Build, set: SetBuild, view: Vista, catalogos: CatalogosCriacaoV12, regiaoCampanha: RegiaoIdV12): ReactNode {
  switch (step) {
    case 0: return (
      <Panel title="Identidade">
        <div className="fj-identidade">
          <label className="fj-campo"><Mono>Nome</Mono><input value={b.nome} onChange={(e) => set({ nome: e.target.value })} className="fj-campo__input fj-campo__input--nome" /></label>
          <label className="fj-campo"><Mono>Codinome</Mono><input value={b.codinome} onChange={(e) => set({ codinome: e.target.value.toUpperCase() })} className="fj-campo__input fj-campo__input--codinome" /></label>
          <label className="fj-campo"><Mono>Ideia geral</Mono><textarea rows={3} value={b.conceito} onChange={(e) => set({ conceito: e.target.value })} className="fj-campo__input fj-campo__input--area" /></label>
          <label className="fj-campo"><Mono>Aparência</Mono><textarea rows={3} value={b.aparencia} onChange={(e) => set({ aparencia: e.target.value })} className="fj-campo__input fj-campo__input--area fj-campo__input--suave" /></label>
        </div>
      </Panel>
    );
    case 1: return <RegiaoLateral b={b} set={set} id={view.regiao} regiaoCampanha={regiaoCampanha} />;
    case 2: return <OrigemNarrativa b={b} set={set} />;
    case 3: return <FichaTracos b={b} set={set} catalogos={catalogos} />;
    case 4: return <ClasseLateral b={b} set={set} id={view.classe} />;
    case 5: {
      const [c, m, a] = b.atributos;
      const rows: [string, number, number, string][] = [["Vitalidade", 8 + c * 3, 20, "CORPO"], ["Foco", 4 + m * 2, 12, "MENTE"], ["Resolução", 4 + a * 2, 12, "ÂNIMO"], ["Defesa", 10 + Math.max(c, m), 14, "MAIOR"]];
      return (
        <Panel title="Recursos derivados" right={<Mono tom="cy">Ilustrativo</Mono>}>
          <div className="fj-recursos">
            {rows.map(([n, v, max, src]) => (
              <div key={n} className="fj-recurso">
                <div className="fj-ch-l fj-recurso__moldura">
                  <div className="fj-recurso__topo"><span className="fj-recurso__nome">{n}</span><Mono tom="cy">← {src}</Mono></div>
                  <div className="fj-recurso__trilho"><div className="fj-recurso__barra" style={{ width: `${(v / max) * 100}%` }} /><span className="fj-recurso__valor">{v}</span></div>
                </div>
              </div>
            ))}
          </div>
          <p className="fj-recursos__nota">Próximo passo: perfil de Perícias sugerido a partir desta distribuição.</p>
        </Panel>
      );
    }
    case 6: return <VertenteLateral b={b} set={set} id={view.vertente} />;
    default: {
      const nomeDe = (lista: { slug: string; nome: string }[], m: Record<string, number>) => Object.entries(m).map(([k, v]) => `${lista.find((x) => x.slug === k)?.nome ?? k} (${v})`).join(", ");
      const regiao = REGIOES.find((r) => r.id === b.regiao)?.nome ?? "";
      const rows: [string, string][] = [
        ["Região", b.local ? `${regiao} · ${b.local}` : regiao],
        ["Antecedente", catalogos.antecedentes.find((x) => x.slug === b.antecedente)?.nome ?? ""],
        ["Qualidades", nomeDe(catalogos.qualidades, b.qualidades)],
        ["Complicações", nomeDe(catalogos.complicacoes, b.complicacoes)],
        ["Classe", CLASSES_ACERVO.find((x) => x.id === b.classe)?.nome ?? ""],
        ["Corpo · Mente · Ânimo", b.atributos.join(" · ")],
        ["Vertente", VERTENTES_ACERVO.find((x) => x.id === b.vertente)?.nome ?? ""],
        ["Magias", b.magias.join(", ")],
        ["Perícias", ""],
        ["Equipamento", ""],
      ];
      return (
        <Panel title="Registro final" right={<Mono tom="cy">RPI #0417</Mono>}>
          <p className="fj-revisao__conceito">“{b.conceito}”</p>
          {rows.map(([k, v]) => (
            <div key={k} className="fj-revisao__linha">
              <Mono>{k}</Mono>
              <span className={`fj-revisao__valor ${v ? "" : "fj-revisao__valor--pendente"}`}>{v || "⚠ Pendente"}</span>
            </div>
          ))}
        </Panel>
      );
    }
  }
}
