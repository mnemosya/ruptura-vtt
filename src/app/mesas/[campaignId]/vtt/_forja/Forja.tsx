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
import { RANKINGS_V12, REGIOES_V12, escolhasDoAvancoV12, perfisAtributosV12, resolveClassResourceV12, type AttributeIdV12, type ClassContentV12, type DraftV12, type RankingV12, type RegiaoIdV12 } from "../../../../../lib/rulesetV12";
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
import { ProgressaoInicial } from "./ProgressaoInicial";
import { Progressao, ProgressaoLateral } from "./passos/Progressao";
import { avancarRankingV12Action } from "../_acoes/evolucaoV12Actions";

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
  /**
   * Personagem sem campanha (página Personagens): sela sem mesa, com o
   * conteúdo oficial, e sem avatar — a imagem é guardada na campanha, então
   * o avatar vem depois que o personagem entrar numa. O rank inicial é
   * livre, como com campanha: sela no F e a progressão sobe até o escolhido.
   */
  semCampanha?: boolean;
  /** Ranking sugerido pela campanha, editável na Forja. */
  rankingInicial?: RankingV12;
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

export function Forja({ catalogos, regiaoCampanha: regiaoFixa, nomeMesa = "Mesa de teste", siglaNarrador = "MJ", campaignId, semCampanha = false, rankingInicial = RANKING_INICIAL, completar = null, onSair, onConcluir }: ForjaProps) {
  const [started, setStarted] = useState(false);
  const c = useCriacao({ catalogos, regiaoCampanha: regiaoFixa ?? null, rankingInicial, campaignId, semCampanha, completar });
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
  const [progressao, setProgressao] = useState<{ characterId: string; alvo: RankingV12 } | null>(null);
  const [aplicando, setAplicando] = useState(false);
  // O passo Progressão só existe com rank acima de F.
  const ocultoPasso = (i: number) => PASSOS[i]?.key === "progressao" && !c.temProgressao;
  const selar = async () => {
    const id = await c.concluir({ pn: catalogos.ehNarrador && pn });
    if (!id) return;
    if (!campaignId && !semCampanha) return;
    // Avatar só existe com campanha (a imagem é guardada nela).
    if (campaignId && avatar.preparada) await avatar.enviar(campaignId, id);
    const alvo = d.rankingInicial ?? rankingInicial;
    if (alvo === "F") { onConcluir?.(id); return; }
    // Aplica Ranking a Ranking as escolhas feitas no passo Progressão. Se
    // algum avanço falhar, a janela de Progressão inicial assume dali.
    setAplicando(true);
    for (const etapa of c.etapas) {
      const r = await avancarRankingV12Action(campaignId ?? null, id, escolhasDoAvancoV12(etapa));
      if (!r.ok) { setAplicando(false); setProgressao({ characterId: id, alvo }); return; }
    }
    setAplicando(false);
    onConcluir?.(id);
  };

  const raiz = `fj-root ${oxanium.variable} mo-scope fj-forja`;
  if (!started) {
    return (
      <div style={vars} className={raiz}>
        <Titulo
          semCampanha={semCampanha}
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
        <BarraTopo group={cur.group} label={cur.label} onExit={() => { void c.salvarAgora(); setStarted(false); }} />

        <div className="fj-sem-barra fj-grade">
          <MenuLateral step={passo} setStep={c.irPara} completos={c.passosCompletos} nomeMesa={nomeMesa} siglaNarrador={siglaNarrador} status={status} oculto={ocultoPasso} />
          <main key={passo} className="fj-boot fj-centro">
            {centro({ c, catalogos, classe, view, onView, avatar, nomeAntecedente, semAvatar: semCampanha })}
          </main>
          <aside className="fj-sem-barra fj-lateral">
            <PlacaIdentidade d={d} avatar={avatar.url} progress={c.sincronia} ranking={d.rankingInicial ?? rankingInicial} onRankingChange={(ranking) => set({ rankingInicial: ranking })} />
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
          oculto={ocultoPasso}
          pendentes={c.pendencias.length}
          podeSelar={Boolean(campaignId) || semCampanha}
          enviando={c.enviando || aplicando}
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
      {progressao && (campaignId || semCampanha) && <ProgressaoInicial key={progressao.characterId} campaignId={campaignId ?? null}
        characterId={progressao.characterId} alvo={progressao.alvo}
        onConcluir={() => { const id = progressao.characterId; setProgressao(null); onConcluir?.(id); }} />}
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

function BarraTopo({ group, label, onExit }: { group: string; label: string; onExit: () => void }) {
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
    </header>
  );
}

function MenuLateral({ step, setStep, completos, nomeMesa, siglaNarrador, status, oculto = () => false }: { step: number; setStep: (n: number) => void; completos: boolean[]; nomeMesa: string; siglaNarrador: string; status: string; oculto?: (i: number) => boolean }) {
  let last = "";
  return (
    <nav className="fj-menu" aria-label="Passos da forja">
      <div className="fj-ch-tab fj-menu__titulo fj-glow">Forja</div>
      <div className="fj-menu__lista">
        {PASSOS.map((s, i) => {
          if (oculto(i)) return null;
          const hdr = s.group !== last;
          last = s.group;
          const on = i === step;
          return (
            <div key={s.key}>
              {hdr && <div className="fj-menu__grupo"><Mono pequeno tom="cy">{s.group}</Mono><span className="fj-menu__grupo-fio" /></div>}
              <button type="button" title={s.label} onClick={() => setStep(i)} aria-current={on ? "step" : undefined} className={`fj-ch-tab fj-menu__passo ${on ? "fj-menu__passo--atual" : ""}`}>
                {on && <span className="fj-menu__sublinhado" />}
                <span className="fj-menu__n">{String(i + 1).padStart(2, "0")}</span>
                <span className="fj-menu__rotulo">{s.label}</span>
                <span className="fj-sr">{completos[i] ? ", concluído" : ", pendente"}</span>
                <span className={`fj-menu__estado ${completos[i] ? "fj-menu__estado--feito" : ""}`} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      {/* A mesa no rodapé do menu: o selo de quem narra primeiro, o nome
          ao lado, alinhado à esquerda — e o estado do rascunho embaixo. */}
      <div className="fj-menu__mesa">
        <span className="fj-ch-hex fj-menu__narrador">{siglaNarrador}</span>
        <div>
          <Mono>Mesa ativa</Mono>
          <div className="fj-menu__mesa-nome">{nomeMesa}</div>
          {status && <span className="fj-menu__status" aria-live="polite"><Mono pequeno tom="cy">{status}</Mono></span>}
        </div>
      </div>
    </nav>
  );
}

function PlacaIdentidade({ d, avatar, progress, ranking, onRankingChange }: { d: DraftV12; avatar: string; progress: number; ranking: RankingV12; onRankingChange?: (ranking: RankingV12) => void }) {
  const [aberto, setAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setAberto(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setAberto(false); };
    document.addEventListener("pointerdown", fechar);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", fechar); document.removeEventListener("keydown", escape); };
  }, [aberto]);
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
        <div className="fj-placa__rank-wrap" ref={menuRef}>
          <button type="button" className="fj-placa__rank" aria-label={onRankingChange ? `Ranking ${ranking}. Alterar ranking inicial` : `Ranking ${ranking}`}
            aria-expanded={aberto} aria-haspopup="true" disabled={!onRankingChange} onClick={() => setAberto((v) => !v)}>
            <span className="fj-placa__rank-rotulo">Rank</span>
            <span className="fj-placa__rank-valor fj-glow">{ranking}</span>
          </button>
          {aberto && <div className="fj-placa__rank-menu" role="group" aria-label="Ranking inicial do personagem">
            {RANKINGS_V12.map((rank) => <button key={rank} type="button" aria-pressed={ranking === rank}
              onClick={() => { onRankingChange?.(rank); setAberto(false); }} className="fj-placa__rank-opcao">{rank}</button>)}
          </div>}
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

function Doca({ step, setStep, oculto = () => false, pendentes, podeSelar, enviando, erro, rotuloSelar, onSelar }: {
  step: number;
  /** Passo que não existe agora (Progressão com rank F): a navegação pula. */
  oculto?: (i: number) => boolean;
  setStep: (n: number) => void;
  pendentes: number;
  podeSelar: boolean;
  enviando: boolean;
  erro: string | null;
  rotuloSelar: string;
  onSelar: () => void;
}) {
  const podeSelarAgora = podeSelar && pendentes === 0 && !enviando;
  const proximo = (i: number) => { let n = i + 1; while (n < PASSOS.length - 1 && oculto(n)) n++; return n; };
  const anterior = (i: number) => { let n = i - 1; while (n > 0 && oculto(n)) n--; return Math.max(0, n); };
  // Atalhos da doca: Q volta, E confirma (ou sela, no último passo), U abre o avatar.
  // Não disparam enquanto se digita nem com modificadores.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector(".rc-recorte-janela, [aria-modal='true']")) return;
      const tecla = e.key.toLowerCase();
      if (tecla === "q" && step > 0) setStep(anterior(step));
      else if (tecla === "e") { if (step < PASSOS.length - 1) setStep(proximo(step)); else if (podeSelarAgora) onSelar(); }
      else if (tecla === "u") document.getElementById("fj-avatar-arquivo")?.click();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- proximo/anterior derivam de `oculto`
  }, [step, setStep, podeSelarAgora, onSelar, oculto]);
  const motivo = pendentes > 0 ? "Resolva as pendências da Revisão." : !podeSelar ? "O Selar cria o personagem dentro da mesa." : undefined;
  return (
    <footer className="fj-doca">
      <button type="button" onClick={() => setStep(anterior(step))} className="fj-doca__voltar"><Key k="Q" /> Voltar</button>
      {step < PASSOS.length - 1 ? (
        <button type="button" onClick={() => setStep(proximo(step))} className="fj-doca__avancar">
          <span className="fj-doca__confirmar">Confirmar</span>
          <span className="fj-ch fj-doca__proximo">{PASSOS[proximo(step)].label} ›</span>
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
function Titulo({ nomeMesa, c, completar, onContinuar, onNovo, onSair, semCampanha = false }: {
  semCampanha?: boolean;
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
  if (onSair) itens.push({ id: "sair", titulo: semCampanha ? "Voltar" : "Voltar à mesa", sub: semCampanha ? "Personagens" : nomeMesa, primario: false, acao: onSair });

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

function centro({ c, catalogos, classe, view, onView, avatar, nomeAntecedente, semAvatar = false }: Contexto & {
  onView: (k: keyof Vista) => (id: string) => void;
  avatar: AvatarDaForja;
  /** Sem campanha não há onde guardar a imagem: o avatar fica para depois. */
  semAvatar?: boolean;
  nomeAntecedente?: string;
}): ReactNode {
  const { d, set } = c;
  switch (c.passo) {
    case 0: return semAvatar ? (
      <div className="fj-conceito">
        <div className="fj-conceito__avatar">
          <Holograma d={d} avatar={avatar.url} progress={c.sincronia} nomeAntecedente={nomeAntecedente} />
        </div>
        <div className="fj-conceito__rodape">
          <Mono>O avatar é enviado depois que o personagem entrar numa campanha</Mono>
        </div>
      </div>
    ) : (
      <div className="fj-conceito">
        <label className="fj-conceito__avatar">
          <Holograma d={d} avatar={avatar.url} progress={c.sincronia} nomeAntecedente={nomeAntecedente} />
          <span className="fj-conceito__carregar"><Key k="U" /> {avatar.preparada ? "Trocar avatar" : "Carregar avatar"}</span>
          <input id="fj-avatar-arquivo" type="file" accept="image/png,image/jpeg,image/webp" className="fj-sr" onChange={(e) => { const f = e.target.files?.[0]; if (f) avatar.escolher(f); e.target.value = ""; }} />
        </label>
        {avatar.preparada && (
          <div className="fj-conceito__rodape">
            <button type="button" onClick={avatar.remover} className="fj-conceito__remover">Remover avatar</button>
          </div>
        )}
      </div>
    );
    case 1: return <Carrossel items={REGIOES.map((r) => ({ id: r.id, nome: r.nome, img: r.img, top: `CAPITAL · ${r.capital.toUpperCase()}`, sub: r.tag, color: r.tint }))} value={d.regiaoId} viewId={view.regiao} onView={onView("regiao")} onPick={(id) => set({ regiaoId: id, localOrigem: id === d.regiaoId ? d.localOrigem : "" })} cta="Fixar origem" />;
    case 2: return <Antecedente d={d} set={set} catalogos={catalogos} />;
    case 3: return <Tracos d={d} set={set} catalogos={catalogos} />;
    case 4: return <Carrossel items={CLASSES_ACERVO.filter((x) => catalogos.classes.some((k) => k.slug === x.id)).map((x) => ({ id: x.id, nome: x.nome, img: x.arte, top: `CLASSE · ${x.sigla}`, sub: x.papel }))} value={d.classeSlug} viewId={view.classe} onView={onView("classe")} onPick={c.trocarClasse} cta="Assumir classe" />;
    case 5: return <Atributos d={d} set={set} perfis={perfisAtributosV12(catalogos.classes, d.classeSlug)} avatar={avatar.url} progress={c.sincronia} nomeAntecedente={nomeAntecedente} />;
    case 6: return <Pericias d={d} set={set} catalogos={catalogos} classe={classe} irParaClasse={() => c.irPara(4)} />;
    case 7: return <Carrossel items={VERTENTES_ACERVO.map((v) => ({ id: v.id, nome: v.nome, img: v.arte, top: "VERTENTE PRIMÁRIA", sub: v.frase.split(".")[0], color: v.cor }))} value={d.vertente} viewId={view.vertente} onView={onView("vertente")} onPick={(id) => set({ vertente: id })} cta="Sintonizar" />;
    case 8: return <Progressao d={d} set={set} catalogos={catalogos} etapas={c.etapas} irParaClasse={() => c.irPara(4)} />;
    default: return <div className="fj-revisao-centro"><Holograma d={d} avatar={avatar.url} progress={c.sincronia} solid={c.sincronia >= 1} nomeAntecedente={nomeAntecedente} /></div>;
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
  // Escolher o perfil NÃO distribui os valores: quem cria decide onde
  // cada um vai. Trocar de perfil limpa a distribuição anterior.
  const escolherPerfil = (slug: string) => {
    if (slug === d.perfilAtributos) return;
    set({ perfilAtributos: slug, atributos: { corpo: null, mente: null, animo: null } });
  };
  /**
   * Põe `v` em `alvo`. Se todos os `v` do perfil já estão em outros
   * atributos, troca com um deles — nunca é preciso tirar um valor para
   * poder colocá-lo noutro lugar. Clicar no valor atual limpa.
   */
  const escolher = (alvo: AttributeIdV12, v: number) => {
    if (!perfil) return;
    const atual = d.atributos[alvo];
    if (atual === v) { set({ atributos: { ...d.atributos, [alvo]: null } }); return; }
    const total = perfil.valores.filter((x) => x === v).length;
    const outros = ATRIBUTOS.filter((a) => a.id !== alvo && d.atributos[a.id] === v);
    if (outros.length < total) { set({ atributos: { ...d.atributos, [alvo]: v } }); return; }
    set({ atributos: { ...d.atributos, [alvo]: v, [outros[0].id]: atual } });
  };
  const no = (i: number) => {
    const a = ATRIBUTOS[i];
    const v = d.atributos[a.id];
    const opcoes = perfil ? [...new Set(perfil.valores)].sort((x, y) => x - y) : [];
    const dono = (x: number) => {
      const total = perfil?.valores.filter((y) => y === x).length ?? 0;
      const outros = ATRIBUTOS.filter((o) => o.id !== a.id && d.atributos[o.id] === x);
      return outros.length >= total ? outros[0]?.nome : undefined;
    };
    return (
      <NoAtributo
        valor={v}
        name={a.nome}
        desc={a.desc}
        opcoes={opcoes.map((x) => ({ valor: x, trocaCom: dono(x) }))}
        onEscolher={(x) => escolher(a.id, x)}
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

function NoAtributo({ valor, onEscolher, name, desc, opcoes }: {
  valor: number | null;
  onEscolher: (v: number) => void;
  name: string;
  desc: string;
  /** Valores do perfil; `trocaCom` = atributo que cederia o valor (troca). */
  opcoes: Array<{ valor: number; trocaCom?: string }>;
}) {
  return (
    <div className="fj-atributo">
      <Panel title={name}>
        <p className="fj-atributo__desc">{desc}</p>
        <div className="fj-atributo__controle">
          <span key={valor ?? "x"} className={`fj-boot fj-atributo__valor ${valor === null ? "fj-atributo__valor--vazio" : "fj-glow"}`}>{valor ?? "–"}</span>
          {opcoes.length > 0 ? (
            <span className="fj-atributo__opcoes" role="group" aria-label={`Valor de ${name}`}>
              {opcoes.map((o) => (
                <button type="button" key={o.valor} onClick={() => onEscolher(o.valor)} aria-pressed={valor === o.valor}
                  title={valor === o.valor ? "Limpar" : o.trocaCom ? `Trocar com ${o.trocaCom}` : undefined}
                  className={`fj-ch fj-atributo__opcao ${valor === o.valor ? "fj-atributo__opcao--on" : o.trocaCom ? "fj-atributo__opcao--troca" : ""}`}>
                  {o.valor}
                </button>
              ))}
            </span>
          ) : <Mono pequeno>Escolha um perfil</Mono>}
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
    case 8: return <ProgressaoLateral etapas={c.etapas} />;
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
    ["Região", regiao],
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
            <input type="checkbox" className="fj-check" checked={pn} onChange={(e) => setPn(e.target.checked)} />
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
