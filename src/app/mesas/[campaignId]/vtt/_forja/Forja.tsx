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
import { RANKINGS_V12, REGIOES_V12, perfisAtributosV12, resolveClassResourceV12, type AttributeIdV12, type ClassContentV12, type DraftV12, type RegiaoIdV12 } from "../../../../../lib/rulesetV12";
import { BYTES_ORIGINAL_MAXIMO, ImagemRecusadaError, enviarParaUrlAssinada, prepararRecorteQuadrado, type ImagemPreparada } from "../../../../../lib/vtt/imagePreparation";
import { cancelarUploadAction, definirAvatarPersonagemAction, finalizarUploadAvatarAction, reservarUploadAction } from "../_acoes/imageActions";
import { JanelaRecorte } from "../../../../ficha/_console/RecorteImagem";
import { REGIOES } from "./acervo/regioes";
import { CLASSES_ACERVO } from "./acervo/classes";
import { VERTENTES_ACERVO } from "./acervo/vertentes";
import { Carrossel } from "./Carrossel";
import { Holograma } from "./Holograma";
import { Key, Mono, Panel, Seg } from "./ui";
import { oxanium } from "../../../../_design/oxanium";
import { MarcaRuptura } from "../../../../_design/Marca";
import { AVATAR_PADRAO, PASSOS, RANKING_INICIAL, type SetDraft } from "./tipos";
import { PASSO_DO_CAMPO, useCriacao, type Criacao } from "./useCriacao";
import { RegiaoLateral } from "./passos/Regiao";
import { ClasseLateral } from "./passos/Classe";
import { VertenteLateral } from "./passos/Vertente";
import { Antecedente, FichaTracos, OrigemNarrativa, Tracos } from "./passos/Trajetoria";
import { Pericias, PericiasLateral } from "./passos/Pericias";

export interface ForjaProps {
  catalogos: CatalogosCriacaoV12;
  /** Região onde a campanha começa: define o segundo idioma conhecido. */
  regiaoCampanha?: RegiaoIdV12;
  /** Nome da mesa no topo. */
  nomeMesa?: string;
  /** Sigla de quem narra, no selo do topo. */
  siglaNarrador?: string;
  /** Mesa onde o rascunho é salvo e o personagem é criado. Sem ela (prévia), nada é lido, gravado ou criado. */
  campaignId?: string;
  /** Ranking em que o personagem começa. Hoje sempre F. */
  rankingInicial?: string;
  /** Completar um personagem criado só com o nome (o "+ Personagem" do narrador). */
  completar?: { characterId: string; nome: string } | null;
  /** "Voltar à mesa": fecha a Forja. Sem ela (prévia), o botão não aparece. */
  onSair?: () => void;
  /** Depois do Selar: recebe o personagem criado (a mesa abre a ficha). */
  onConcluir?: (characterId: string) => void;
}

const ATRIBUTOS: Array<{ id: AttributeIdV12; nome: string; desc: string }> = [
  { id: "corpo", nome: "Corpo", desc: "Força, resistência e reflexo." },
  { id: "mente", nome: "Mente", desc: "Raciocínio, percepção e técnica." },
  { id: "animo", nome: "Ânimo", desc: "Vontade, presença e conexão." },
];

export function Forja({ catalogos, regiaoCampanha: regiaoFixa, nomeMesa = "Mesa de teste", siglaNarrador = "MJ", campaignId, rankingInicial = RANKING_INICIAL, completar = null, onSair, onConcluir }: ForjaProps) {
  const [started, setStarted] = useState(false);
  const c = useCriacao({ catalogos, regiaoCampanha: regiaoFixa ?? null, campaignId, completar });
  const { d, set, passo } = c;
  const [view, setView] = useState({ regiao: d.regiaoId as string, classe: CLASSES_ACERVO[0].id, vertente: VERTENTES_ACERVO[0].id as string });
  const onView = (k: keyof typeof view) => (id: string) => setView((v) => ({ ...v, [k]: id }));
  // Sem região guardada na campanha, quem cria informa (vira o idioma da campanha).
  const regiaoCampanha = regiaoFixa ?? ((Object.keys(REGIOES_V12) as RegiaoIdV12[]).find((id) => REGIOES_V12[id].idioma === d.idiomaCampanha) ?? null);
  const setRegiaoCampanha = regiaoFixa ? undefined : (id: RegiaoIdV12) => set({ idiomaCampanha: REGIOES_V12[id].idioma });

  const classe = catalogos.classes.find((x) => x.slug === d.classeSlug);
  const vt = VERTENTES_ACERVO.find((v) => v.id === d.vertente);
  const reg = REGIOES.find((r) => r.id === d.regiaoId);
  const nomeAntecedente = catalogos.antecedentes.find((a) => a.slug === d.antecedenteId)?.nome;
  const vars = { "--vc": vt?.cor ?? "var(--fj-cy)", "--vc-brilho": vt?.brilho ?? "var(--fj-cy)" } as CSSProperties;

  /*
   * Avatar pelas regras do VTT (as mesmas da ficha): recorte quadrado,
   * WebP reduzido e sem EXIF, preparado no navegador. Nada sobe antes do
   * Selar: desistir da criação não deixa imagem órfã na campanha.
   */
  const avatar = useAvatarDaForja();

  const [pn, setPn] = useState(false);
  const selar = async () => {
    const id = await c.concluir({ pn: catalogos.ehNarrador && pn });
    if (!id || !campaignId) return;
    if (avatar.preparada) await avatar.enviar(campaignId, id);
    onConcluir?.(id);
  };

  const raiz = `fj-root ${oxanium.variable} mo-scope fj-forja`;
  if (!started) {
    return (
      <div style={vars} className={raiz}>
        <Titulo
          nomeMesa={nomeMesa}
          c={c}
          completar={completar}
          onContinuar={() => setStarted(true)}
          onNovo={async () => { await c.descartarRascunho(); setStarted(true); }}
          onSair={onSair}
        />
      </div>
    );
  }

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
        <BarraTopo group={cur.group} label={cur.label} onExit={() => { void c.salvarAgora(); setStarted(false); }} nomeMesa={nomeMesa} siglaNarrador={siglaNarrador} status={status} />

        <div className="fj-sem-barra fj-grade">
          <MenuLateral step={passo} setStep={c.irPara} completos={c.passosCompletos} />
          <main key={passo} className="fj-boot fj-centro">
            {centro({ c, catalogos, classe, view, onView, avatar, nomeAntecedente })}
          </main>
          <aside className="fj-sem-barra fj-lateral">
            <PlacaIdentidade d={d} avatar={avatar.url} progress={c.sincronia} ranking={rankingInicial} />
            {c.conflito && (
              <div className="fj-aviso" role="alert">
                <span>Este rascunho foi alterado em outra janela; o salvamento foi pausado para não sobrescrever.</span>
                <button type="button" onClick={c.recarregar} className="fj-aviso__acao">Carregar a versão salva</button>
              </div>
            )}
            {c.aviso && (
              <div className="fj-aviso" role="status">
                <span>{c.aviso}</span>
                <button type="button" onClick={c.dispensarAviso} aria-label="Dispensar aviso">✕</button>
              </div>
            )}
            {avatar.erro && (
              <div className="fj-aviso" role="alert">
                <span>{avatar.erro}</span>
                <button type="button" onClick={avatar.limparErro} aria-label="Dispensar aviso">✕</button>
              </div>
            )}
            <div key={passo} className="fj-boot">{lateral({ c, catalogos, classe, view, regiaoCampanha, setRegiaoCampanha, pn, setPn })}</div>
          </aside>
        </div>

        <Doca
          step={passo}
          setStep={c.irPara}
          pendentes={c.pendencias.length}
          podeSelar={Boolean(campaignId)}
          enviando={c.enviando}
          erro={c.erroEnvio}
          rotuloSelar={completar ? `Selar ${completar.nome}` : "Selar refratário"}
          onSelar={() => void selar()}
        />
      </div>

      {avatar.recortando && (
        <JanelaRecorte
          arquivo={avatar.recortando}
          rotuloConfirmar="Usar no refratário"
          ocupado={avatar.ocupado}
          erro={avatar.erro}
          onConfirmar={(r) => void avatar.confirmarRecorte(r)}
          onCancelar={avatar.cancelarRecorte}
        />
      )}
    </div>
  );
}

/** Estado do avatar: arquivo em recorte, imagem preparada (local) e o envio no Selar. */
function useAvatarDaForja() {
  const [recortando, setRecortando] = useState<File | null>(null);
  const [preparada, setPreparada] = useState<ImagemPreparada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const previewRef = useRef<string | null>(null);
  // A prévia é um `blob:` em memória: solta a anterior ao trocar e a última ao sair.
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const escolher = (f: File) => {
    setErro(null);
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setErro("Formato inválido — use PNG, JPEG ou WebP."); return; }
    if (f.size > BYTES_ORIGINAL_MAXIMO) { setErro("Imagem grande demais — até 30 MB."); return; }
    setRecortando(f);
  };
  const confirmarRecorte = async (recorte: { x: number; y: number; tamanho: number }) => {
    if (!recortando) return;
    setOcupado(true);
    try {
      const p = await prepararRecorteQuadrado(recortando, recorte);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = p.previewUrl;
      setPreparada(p);
      setRecortando(null);
    } catch (e) {
      setErro(e instanceof ImagemRecusadaError || e instanceof Error ? e.message : "Não foi possível preparar a imagem.");
    } finally {
      setOcupado(false);
    }
  };
  const remover = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreparada(null);
  };
  /** Sobe a imagem já preparada e liga ao personagem recém-criado. Falha aqui não desfaz a criação. */
  const enviar = async (campaignId: string, characterId: string) => {
    if (!preparada) return;
    let reservaId: string | null = null;
    try {
      const reserva = await reservarUploadAction(campaignId, preparada.sha256, "avatar", null, characterId);
      if (!reserva.ok || !reserva.dados) throw new Error(reserva.erro ?? "Não foi possível preparar o envio.");
      reservaId = reserva.dados.reservaId;
      if (reserva.dados.reutilizado) {
        const r = await definirAvatarPersonagemAction(campaignId, characterId, reserva.dados.assetId);
        if (!r.ok) throw new Error(r.erro ?? "Não foi possível definir o avatar.");
      } else {
        await enviarParaUrlAssinada(reserva.dados.uploadUrl!, preparada.blob);
        const r = await finalizarUploadAvatarAction(campaignId, reserva.dados.reservaId!, preparada.sha256, characterId);
        if (!r.ok) throw new Error(r.erro ?? "Não foi possível concluir o envio.");
      }
    } catch {
      if (reservaId) void cancelarUploadAction(campaignId, reservaId).catch(() => {});
      // O personagem já existe: o avatar pode ser enviado de novo pela ficha.
    }
  };
  return {
    url: preparada?.previewUrl ?? AVATAR_PADRAO,
    preparada, recortando, erro, ocupado,
    escolher, confirmarRecorte, remover, enviar,
    cancelarRecorte: () => setRecortando(null),
    limparErro: () => setErro(null),
  };
}
type AvatarDaForja = ReturnType<typeof useAvatarDaForja>;

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
              <button type="button" title={s.label} onClick={() => setStep(i)} aria-current={on ? "step" : undefined} className={`fj-ch-tab fj-menu__passo ${on ? "fj-menu__passo--atual" : ""}`}>
                {on && <span className="fj-menu__sublinhado" />}
                <span className="fj-menu__n">0{i + 1}</span>
                <span className="fj-menu__rotulo">{s.label}</span>
                <span className="fj-sr">{completos[i] ? ", concluído" : ", pendente"}</span>
                <span className={`fj-menu__estado ${completos[i] ? "fj-menu__estado--feito" : ""}`} aria-hidden="true" />
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

function Doca({ step, setStep, pendentes, podeSelar, enviando, erro, rotuloSelar, onSelar }: {
  step: number;
  setStep: (n: number) => void;
  pendentes: number;
  podeSelar: boolean;
  enviando: boolean;
  erro: string | null;
  rotuloSelar: string;
  onSelar: () => void;
}) {
  const podeSelarAgora = podeSelar && pendentes === 0 && !enviando;
  // Atalhos da doca: Q volta, E confirma (ou sela, no último passo), U abre o avatar.
  // Não disparam enquanto se digita nem com modificadores.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector(".rc-recorte-janela, [aria-modal='true']")) return;
      const tecla = e.key.toLowerCase();
      if (tecla === "q" && step > 0) setStep(step - 1);
      else if (tecla === "e") { if (step < PASSOS.length - 1) setStep(step + 1); else if (podeSelarAgora) onSelar(); }
      else if (tecla === "u") document.getElementById("fj-avatar-arquivo")?.click();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [step, setStep, podeSelarAgora, onSelar]);
  const motivo = pendentes > 0 ? "Resolva as pendências da Revisão." : !podeSelar ? "O Selar cria o personagem dentro da mesa." : undefined;
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
          {erro ? <span className="fj-doca__erro" role="alert">{erro}</span> : pendentes > 0 ? <Mono tom="am">{pendentes} pendência{pendentes > 1 ? "s" : ""}</Mono> : null}
          <button type="button" disabled={!podeSelarAgora} aria-busy={enviando} onClick={onSelar} title={motivo} className="fj-ch fj-doca__selar">
            {enviando ? "Selando…" : rotuloSelar}
          </button>
        </div>
      )}
    </footer>
  );
}

/* ================= TELA INICIAL ================= */
function Titulo({ nomeMesa, c, completar, onContinuar, onNovo, onSair }: {
  nomeMesa: string;
  c: Criacao;
  completar: { characterId: string; nome: string } | null;
  onContinuar: () => void;
  onNovo: () => Promise<void>;
  onSair?: () => void;
}) {
  const [confirmarNovo, setConfirmarNovo] = useState(false);
  const carregando = c.estado.tipo === "carregando";
  type Item = { id: string; titulo: string; sub: string; primario: boolean; acao: () => void; desabilitado?: boolean };
  const itens: Item[] = [];
  if (completar) {
    itens.push({ id: "completar", titulo: `Completar ${completar.nome}`, sub: "Personagem criado só com o nome", primario: true, acao: onContinuar });
  } else {
    if (c.temRascunhoSalvo) {
      itens.push({ id: "continuar", titulo: "Continuar rascunho", sub: `${c.d.nome || "Sem nome"} · ${Math.round(c.sincronia * 100)}% sincronizado`, primario: true, acao: onContinuar });
    }
    itens.push({
      id: "novo",
      titulo: "Novo refratário",
      sub: carregando ? "Verificando rascunho salvo…" : confirmarNovo ? "Clique de novo para apagar o rascunho e começar do zero" : "Iniciar protocolo de forja",
      primario: !c.temRascunhoSalvo,
      desabilitado: carregando,
      acao: () => {
        if (!c.temRascunhoSalvo) { onContinuar(); return; }
        if (!confirmarNovo) { setConfirmarNovo(true); return; }
        void onNovo();
      },
    });
  }
  if (onSair) itens.push({ id: "sair", titulo: "Voltar à mesa", sub: nomeMesa, primario: false, acao: onSair });

  const primario = itens.find((i) => i.primario && !i.desabilitado);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement) && primario) primario.acao(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [primario]);

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
          <MarcaRuptura />
        </div>
        <div className="fj-titulo__sub"><span className="fj-titulo__sub-fio" /><span className="fj-titulo__sub-texto">Forja de Refratário</span></div>
        {c.estado.tipo === "erro" && <p className="fj-titulo__alerta" role="alert">Não foi possível verificar o rascunho salvo: {c.estado.mensagem} <button type="button" onClick={c.recarregar}>Tentar de novo</button></p>}
        {c.estado.tipo === "incompativel" && <p className="fj-titulo__alerta" role="alert">{c.estado.mensagem} <button type="button" onClick={() => void onNovo()}>Descartar e começar do zero</button></p>}
        <div className="fj-titulo__menu">
          {itens.map((it) => (
            <button type="button" key={it.id} disabled={it.desabilitado} onClick={it.acao} className={`fj-ch-tab fj-titulo__item ${it.primario ? "fj-titulo__item--primario" : ""}`}>
              {it.primario && <span className="fj-titulo__item-sublinhado" />}
              <div><div className="fj-titulo__item-nome">{it.titulo}</div><Mono>{it.sub}</Mono></div>
              <span className="fj-titulo__item-seta" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
        {primario && <div className="fj-titulo__dica"><Key k="ENTER" /><span className="fj-pulso">Pressione para {primario.id === "continuar" ? "continuar" : "iniciar"}</span></div>}
      </div>
      <div className="fj-titulo__versao"><Mono>Ranking inicial · F</Mono><br /><Mono tom="cy">VTT · Sistema RUPTURA</Mono></div>
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

function centro({ c, catalogos, classe, view, onView, avatar, nomeAntecedente }: Contexto & {
  onView: (k: keyof Vista) => (id: string) => void;
  avatar: AvatarDaForja;
  nomeAntecedente?: string;
}): ReactNode {
  const { d, set } = c;
  switch (c.passo) {
    case 0: return (
      <div className="fj-conceito">
        <label className="fj-conceito__avatar">
          <Holograma d={d} avatar={avatar.url} progress={c.sincronia} nomeAntecedente={nomeAntecedente} />
          <span className="fj-conceito__carregar"><Key k="U" /> {avatar.preparada ? "Trocar avatar" : "Carregar avatar"}</span>
          <input id="fj-avatar-arquivo" type="file" accept="image/png,image/jpeg,image/webp" className="fj-sr" onChange={(e) => { const f = e.target.files?.[0]; if (f) avatar.escolher(f); e.target.value = ""; }} />
        </label>
        <div className="fj-conceito__rodape">
          <Mono>Avatar enviado pelo jogador · projetado como registro holográfico</Mono>
          {avatar.preparada && <button type="button" onClick={avatar.remover} className="fj-conceito__remover">Remover avatar</button>}
        </div>
      </div>
    );
    case 1: return <Carrossel items={REGIOES.map((r) => ({ id: r.id, nome: r.nome, img: r.img, top: `CAPITAL · ${r.capital.toUpperCase()}`, sub: r.tag, color: r.tint }))} value={d.regiaoId} viewId={view.regiao} onView={onView("regiao")} onPick={(id) => set({ regiaoId: id, localOrigem: id === d.regiaoId ? d.localOrigem : "" })} cta="Fixar origem" />;
    case 2: return <Antecedente d={d} set={set} catalogos={catalogos} />;
    case 3: return <Tracos d={d} set={set} catalogos={catalogos} />;
    case 4: return <Carrossel items={CLASSES_ACERVO.filter((x) => catalogos.classes.some((k) => k.slug === x.id)).map((x) => ({ id: x.id, nome: x.nome, img: x.arte, top: `CLASSE · ${x.sigla}`, sub: x.papel }))} value={d.classeSlug} viewId={view.classe} onView={onView("classe")} onPick={c.trocarClasse} cta="Assumir classe" />;
    case 5: return <Atributos d={d} set={set} perfis={perfisAtributosV12(catalogos.classes, d.classeSlug)} avatar={avatar.url} progress={c.sincronia} nomeAntecedente={nomeAntecedente} />;
    case 6: return <Pericias d={d} set={set} catalogos={catalogos} classe={classe} irParaClasse={() => c.irPara(4)} />;
    case 7: return <Carrossel items={VERTENTES_ACERVO.map((v) => ({ id: v.id, nome: v.nome, img: v.arte, top: "VERTENTE PRIMÁRIA", sub: v.frase.split(".")[0], color: v.cor }))} value={d.vertente} viewId={view.vertente} onView={onView("vertente")} onPick={(id) => set({ vertente: id })} cta="Sintonizar" />;
    default: return <div className="fj-revisao-centro"><Holograma d={d} avatar={avatar.url} progress={1} solid nomeAntecedente={nomeAntecedente} /></div>;
  }
}

/**
 * Atributos pela regra da v1.2: um perfil (ex.: 3 · 1 · 0)
 * distribuído entre Corpo, Mente e Ânimo. Escolher o perfil já distribui;
 * − e + trocam o valor com o atributo que tem o vizinho, então a
 * distribuição está sempre completa e sempre válida.
 */
function Atributos({ d, set, perfis, avatar, progress, nomeAntecedente }: { d: DraftV12; set: SetDraft; perfis: ClassContentV12["criacao"]["perfis_atributos"]; avatar: string; progress: number; nomeAntecedente?: string }) {
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
          <Mono>Perfil de Atributos</Mono>
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

function lateral({ c, catalogos, classe, view, regiaoCampanha, setRegiaoCampanha, pn, setPn }: Contexto & {
  regiaoCampanha: RegiaoIdV12 | null;
  setRegiaoCampanha?: (id: RegiaoIdV12) => void;
  pn: boolean;
  setPn: (v: boolean) => void;
}): ReactNode {
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
    case 1: return <RegiaoLateral d={d} set={set} id={view.regiao} regiaoCampanha={regiaoCampanha} setRegiaoCampanha={setRegiaoCampanha} />;
    case 2: return <OrigemNarrativa d={d} set={set} forja={forja} setForja={setForja} />;
    case 3: return <FichaTracos d={d} set={set} catalogos={catalogos} />;
    case 4: return <ClasseLateral d={d} escolher={c.trocarClasse} id={view.classe} />;
    case 5: {
      if (!classe) return <Panel title="Recursos iniciais"><p className="fj-recursos__nota">Os recursos usam as fórmulas da Classe. Escolha uma Classe para vê-los.</p></Panel>;
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
    default: return <Revisao c={c} catalogos={catalogos} classe={classe} pn={pn} setPn={setPn} />;
  }
}

function Revisao({ c, catalogos, classe, pn, setPn }: { c: Criacao; catalogos: CatalogosCriacaoV12; classe?: ClassContentV12; pn: boolean; setPn: (v: boolean) => void }) {
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
        {catalogos.ehNarrador && c.persiste && (
          <label className="fj-revisao__pn">
            <input type="checkbox" checked={pn} onChange={(e) => setPn(e.target.checked)} />
            <span>É um PN (personagem do narrador)</span>
          </label>
        )}
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
