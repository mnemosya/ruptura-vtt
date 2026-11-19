"use client";

/**
 * PROPOSTA D — RÉGUA.
 *
 * Sem janela: a rolagem vira uma barra de ação larga no pé do palco.
 * À esquerda, o teste montado como frase; à direita, a RÉGUA — as dez
 * faces do d10 lado a lado, cada casa já com o total que daria e
 * pintada pela faixa que cairia contra a CD (ou contra o oponente).
 * Antes de rolar ela é a leitura das chances; depois, o Dado Normal
 * acende a sua casa e o Dado de Sobrecarga marca a dele por baixo, com
 * o preço pendurado. Trocar é levar a luz de uma casa para a outra.
 *
 * Cor: o Sobrecarga é VIOLETA (a cor de magia no VTT), por forma
 * (losango) e por luz; o âmbar fica nas faixas limitadas e na carga.
 */

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Lock, Undo2, Users } from "lucide-react";
import { PolyDie } from "../../mesas/[campaignId]/vtt/_dados3d/PolyDie";
import { RollButton } from "../../mesas/[campaignId]/vtt/_dados3d/ResultadoRolagem";
import { Chevron } from "../../mesas/[campaignId]/vtt/_dados3d/icones";
import { Prototipo } from "../rolagem/_base/Prototipo";
import { estiloTremor } from "../rolagem/_base/Janela";
import {
  resolucao, resolucaoAntes, trocada, usado, useProto, useRolagemDaJanela, parcelasDe, type Proposta, type Rolagem,
} from "../rolagem/_base/estado";
import { CartaoTeste, LinhaVeredito, PALETA_ATUAL, corDaLeitura, margemTexto, rotuloDaLeitura } from "../rolagem/_base/pecas";
import { resolverTeste, type Alvo, type Resolucao } from "../rolagem/_base/regra";
import type { MesaApi } from "../rolagem/_base/MesaDupla";
import {
  Escolha, Passo, consequenciaDaTroca, precoDaTroca, useComposicao, type TomPreco,
} from "../rolagem/_base/compor";

const VIOLETA = "#b197ff";
const CIANO = "#00d4ff";
const PALETA = PALETA_ATUAL;

const COR_TOM: Record<TomPreco, string> = { ponto: VIOLETA, ruptura: "#ff4fd8", integridade: "#ff5f74", ultima: "#ff5f74" };

function corDe(res: Resolucao | null): string {
  return corDaLeitura(res, PALETA).hex;
}

/** Casa (0–9) onde a régua passa a dar sucesso; 10 = nenhuma passa. */
function portaoDe(faces: Resolucao[]): number {
  const i = faces.findIndex((f) => f.sucesso);
  return i < 0 ? 10 : i;
}

function rotuloAlvo(alvo: Alvo): string | null {
  return alvo.tipo === "cd" ? `CD ${alvo.cd}` : alvo.tipo === "contestado" ? `VS ${alvo.oponente}` : null;
}

/* ── régua ──────────────────────────────────────────────────────────── */

interface Marca { normal: number | null; sobrecarga: number | null; usado: "normal" | "sobrecarga" }

/**
 * A régua em si — usada grande na barra e pequena no chat. `faces` é a
 * leitura das dez faces (do teste congelado ou do que está montado).
 */
function Regua({ faces, alvo, marca, previa = false, estado, mini = false, filhos }: {
  faces: Resolucao[];
  alvo: Alvo;
  marca: Marca | null;
  /** Ponteiro sobre o "usar": a casa do Sobrecarga se acende em tracejado. */
  previa?: boolean;
  estado: "ocioso" | "rolando" | "pronto";
  mini?: boolean;
  filhos?: React.ReactNode;
}) {
  const portao = portaoDe(faces);
  const rot = rotuloAlvo(alvo);
  const iUsado = marca ? (marca.usado === "normal" ? marca.normal : marca.sobrecarga) : null;
  const iOutro = marca && marca.usado === "normal" ? marca.sobrecarga : marca?.normal ?? null;
  const corUsado = iUsado != null ? corDe(faces[iUsado - 1]) : CIANO;
  return (
    <div className={`rd-regua${mini ? " is-mini" : ""}`} data-estado={estado} data-alvo={alvo.tipo}
      style={{ ["--portao" as string]: portao, ["--c" as string]: corUsado } as CSSProperties}>
      <ol className="rd-casas" aria-label="Total de cada face do d10">
        {faces.map((f, i) => {
          const face = i + 1;
          const cor = corDe(f);
          const daNormal = marca?.normal === face;
          const daSobre = marca?.sobrecarga === face;
          return (
            <li key={face} className="rd-casa" data-faixa={f.faixa ?? (f.empate === "oponente" ? "empate" : "sem")}
              data-acesa={iUsado === face || undefined} data-outra={iOutro === face && !(iUsado === face) || undefined}
              data-normal={daNormal || undefined} data-sobre={daSobre || undefined}
              style={{ ["--cf" as string]: cor, ["--d" as string]: `${i * 18}ms` } as CSSProperties}
              aria-label={`Face ${face}: total ${f.total}${f.faixa || f.empate ? `, ${rotuloDaLeitura(f)}` : ""}`}>
              <span className="rd-casa-total">{f.total}</span>
              {!mini && <span className="rd-casa-face" aria-hidden="true">{face}</span>}
            </li>
          );
        })}
      </ol>
      {rot && (
        <span className="rd-portao" aria-hidden="true" data-borda={portao === 0 ? "inicio" : portao === 10 ? "fim" : undefined}>
          {!mini && <span className="rd-portao-rot">{rot}</span>}
        </span>
      )}
      {iUsado != null && <span className="rd-foco" aria-hidden="true" style={{ ["--i" as string]: iUsado - 1 } as CSSProperties} />}
      {previa && marca?.sobrecarga != null && marca.usado === "normal" && (
        <span className="rd-foco is-previa" aria-hidden="true"
          style={{ ["--i" as string]: marca.sobrecarga - 1, ["--c" as string]: corDe(faces[marca.sobrecarga - 1]) } as CSSProperties} />
      )}
      {marca?.sobrecarga != null && (
        <span className="rd-losango" aria-hidden="true" data-usado={marca.usado === "sobrecarga" || undefined}
          style={{ ["--i" as string]: marca.sobrecarga - 1 } as CSSProperties} />
      )}
      {filhos}
    </div>
  );
}

/* ── conduto ────────────────────────────────────────────────────────── */

function Conduto({ realce }: { realce: boolean }) {
  const s = useProto();
  const c = s.conduto;
  const excedentes = Math.max(2, c.sobrecarga - c.limite + 1);
  const casas = c.limite + excedentes;
  return (
    <div className="rd-conduto" aria-label={`Sobrecarga ${c.sobrecarga} de ${c.limite}, Integridade ${c.integridade}`}>
      <div className="rd-conduto-linha">
        <span className="rd-conduto-rot">Sobrecarga</span>
        <span className="rd-conduto-v" data-testid="d-sobrecarga">{c.sobrecarga}<small>/{c.limite}</small></span>
      </div>
      <span className="rd-pips" aria-hidden="true">
        {Array.from({ length: casas }, (_, i) => (
          <span key={i} className="rd-pip"
            data-cheio={i < c.sobrecarga || undefined}
            data-limite={i === c.limite - 1 || undefined}
            data-excede={i >= c.limite || undefined}
            data-proximo={realce && i === c.sobrecarga || undefined} />
        ))}
      </span>
      <div className="rd-conduto-linha">
        <span className="rd-conduto-rot">Integridade</span>
        <span className="rd-conduto-v" data-testid="d-integridade">{c.integridade}</span>
      </div>
    </div>
  );
}

/* ── painel de leitura (acima da régua) ─────────────────────────────── */

function Leitura({ r, previa }: { r: Rolagem | null; previa: boolean }) {
  const comp = useComposicao();
  if (!r) {
    const rot = rotuloAlvo(comp.alvo);
    return (
      <div className="rd-leitura is-ociosa">
        <span className="rd-total is-faixa">{comp.base + 1}<i>–</i>{comp.base + 10}</span>
        <span className="rd-leitura-txt">
          <span className="rd-veredito" style={{ color: "#b8d8e8" }}>
            {rot ? `${comp.passam} de 10 faces passam` : "Sem CD"}
          </span>
          <span className="rd-sub">d10 + {comp.atributo.nome.toLowerCase()} {comp.atributo.valor}{comp.pericia ? ` + ${comp.pericia.nome.toLowerCase()} ${comp.pericia.valor}` : ""}{comp.parcelas.modificador ? ` ${comp.parcelas.modificador > 0 ? "+" : "−"} ${Math.abs(comp.parcelas.modificador)}` : ""}{rot ? ` · ${rot.toLowerCase()}` : ""}</span>
          <span className="rd-extra" aria-hidden="true" />
        </span>
      </div>
    );
  }
  const res = resolucao(r);
  const antes = resolucaoAntes(r);
  const sobre = r.sobrecarga != null && !trocada(r) ? resolucao(r, "sobrecarga") : null;
  const cor = corDe(res);
  const t = r.teste;
  const alvo = t.alvo.tipo === "cd" ? `cd ${t.alvo.cd}` : t.alvo.tipo === "contestado" ? `vs ${t.alvo.oponente}` : "sem cd";
  if (!res) {
    return (
      <div className="rd-leitura is-rolando" aria-live="polite">
        <span className="rd-total is-rolando" aria-hidden="true"><span className="rd-girando" style={{ display: "block" }}><PolyDie sides={10} semValor active accent={CIANO} soft="rgba(0,212,255,.1)" size={46} /></span></span>
        <span className="rd-leitura-txt">
          <span className="rd-veredito" style={{ color: "#7f95b3" }}>Rolando</span>
          <span className="rd-sub">{t.nome} · {t.pericia?.nome ?? t.atributo.nome}</span>
          <span className="rd-extra" aria-hidden="true" />
        </span>
      </div>
    );
  }
  const Icone = corDaLeitura(res, PALETA).Icone;
  return (
    <div className="rd-leitura" aria-live="polite" key={`${r.id}-${usado(r)}`}>
      <span className="rd-total" style={{ color: cor }} data-testid="d-total">{res.total}</span>
      <span className="rd-leitura-txt">
        <span className="rd-veredito" style={{ color: cor }}>
          <Icone width={15} height={15} aria-hidden="true" />
          <span className="rd-veredito-nome">{rotuloDaLeitura(res)}</span>
          {res.margem != null && <b>{margemTexto(res.margem)}</b>}
        </span>
        <span className="rd-sub">
          d10 {res.dado} + {t.atributo.nome.toLowerCase()} {t.atributo.valor}
          {t.pericia ? ` + ${t.pericia.nome.toLowerCase()} ${t.pericia.valor}` : ""}
          {t.modificador ? ` ${t.modificador > 0 ? "+" : "−"} ${Math.abs(t.modificador)}` : ""} · {alvo}
        </span>
        {antes ? (
          <span className="rd-antes" data-testid="d-antes">antes {antes.total} · {rotuloDaLeitura(antes)}{antes.margem != null ? ` ${margemTexto(antes.margem)}` : ""}</span>
        ) : previa && sobre ? (
          <span className="rd-previa" style={{ color: corDe(sobre) }}>→ {sobre.total} · {rotuloDaLeitura(sobre)}{sobre.margem != null ? ` ${margemTexto(sobre.margem)}` : ""}</span>
        ) : <span className="rd-extra" aria-hidden="true" />}
      </span>
    </div>
  );
}

/* ── a decisão, pendurada na casa do Sobrecarga ─────────────────────── */

/**
 * A etiqueta fica sob a casa do Sobrecarga, mas nunca sai da régua:
 * mede a própria largura e encosta na borda quando não cabe centrada.
 */
function usePendurar(i: number) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const regua = el?.closest(".rd-regua") as HTMLElement | null;
    if (!el || !regua) return;
    const posicionar = () => {
      const largura = regua.clientWidth;
      const gap = Number.parseFloat(getComputedStyle(regua).getPropertyValue("--rd-gap")) || 3;
      const casa = (largura - 9 * gap) / 10;
      const centro = i * (casa + gap) + casa / 2;
      const w = el.offsetWidth;
      el.style.left = `${Math.round(Math.max(0, Math.min(largura - w, centro - w / 2)))}px`;
    };
    posicionar();
    const ro = new ResizeObserver(posicionar);
    ro.observe(regua);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return ref;
}

function Etiqueta({ r, setPrevia }: { r: Rolagem; setPrevia: (v: boolean) => void }) {
  const s = useProto();
  const ref = usePendurar(r.sobrecarga != null ? r.sobrecarga - 1 : 0);
  if (r.sobrecarga == null) {
    return (
      <span ref={ref as RefObject<HTMLSpanElement>} className="rd-etq is-voo">
        <span className="rd-etq-losango is-girando" aria-hidden="true" /> Sobrecarga no ar
      </span>
    );
  }
  if (trocada(r)) {
    const pendente = !!r.perdaPendente;
    const cons = r.troca ? consequenciaDaTroca(r.troca) : null;
    return (
      <span ref={ref as RefObject<HTMLSpanElement>} className="rd-etq is-usada" style={{ ["--tom" as string]: cons ? COR_TOM[cons.tom] : VIOLETA } as CSSProperties}>
        <span className="rd-etq-txt">
          <b>Sobrecarga em uso</b>
          <small data-testid="d-consequencia">{pendente ? `${r.perdaPendente!.d4}d4 rolando na mesa` : cons ? `${cons.titulo} · ${cons.detalhe}` : ""}</small>
        </span>
        <button type="button" className="rd-etq-desfazer rp-acao" onClick={() => s.desfazer(r.id)} data-testid="d-desfazer">
          <Undo2 size={12} strokeWidth={2.2} aria-hidden="true" /> Desfazer
        </button>
      </span>
    );
  }
  const preco = precoDaTroca(s.custo);
  const sobre = resolucao(r, "sobrecarga");
  return (
    <button ref={ref as RefObject<HTMLButtonElement>} type="button" className="rd-etq rp-acao" data-testid="d-usar"
      style={{ ["--tom" as string]: COR_TOM[preco.tom] } as CSSProperties}
      onPointerEnter={() => setPrevia(true)} onPointerLeave={() => setPrevia(false)}
      onFocus={() => setPrevia(true)} onBlur={() => setPrevia(false)}
      onClick={() => { setPrevia(false); void s.trocar(r.id); }}
      aria-label={`Usar o Dado de Sobrecarga: ${sobre?.total} ${rotuloDaLeitura(sobre)}. Custo: ${preco.titulo}, ${preco.detalhe}`}>
      <span className="rd-etq-losango" aria-hidden="true" />
      <span className="rd-etq-txt">
        <b>Usar Sobrecarga</b>
        <small><em>{preco.titulo}</em> · {preco.detalhe}</small>
      </span>
    </button>
  );
}

/* ── composição (esquerda) ──────────────────────────────────────────── */

function Compor() {
  const s = useProto();
  const comp = useComposicao();
  const { personagem, teste, setTeste, rolando } = s;
  const r = useRolagemDaJanela();
  const contestado = teste.alvoTipo === "contestado";
  const tremendo = s.carga > 0 && !rolando;
  const emVoo = !!r && r.fase !== "completa";
  return (
    <div className="rd-compor">
      <div className="rd-quem">
        <Escolha titulo="Rolando como" valor={personagem.id} desabilitado={rolando} classe="rd-esc-quem" lado="cima" testId="d-quem"
          opcoes={s.personagens.map((p) => ({ id: p.id, rotulo: s.nomeLongo && p.id === personagem.id ? p.nomeLongo : p.nome, valor: (p.id === personagem.id ? s.magista : p.magista) ? "Magista" : "PJ" }))}
          onEscolher={s.escolherPersonagem}>
          <span className="rd-av" aria-hidden="true">{personagem.sigla}</span>
          <span className="rd-quem-nome">{s.nomeVisivel}</span>
          <Chevron width={13} height={13} strokeWidth={2} aria-hidden="true" />
        </Escolha>
        <button type="button" className="rd-visib rp-acao" aria-label={`Quem vê: ${teste.visibilidade === "public" ? "a mesa" : "só você"}. Alternar`}
          title={teste.visibilidade === "public" ? "A mesa toda vê" : "Só você vê"}
          onClick={() => setTeste({ visibilidade: teste.visibilidade === "public" ? "private" : "public" })}>
          {teste.visibilidade === "public" ? <Users size={14} strokeWidth={1.9} /> : <Lock size={14} strokeWidth={1.9} />}
          <span>{teste.visibilidade === "public" ? "Mesa" : "Privada"}</span>
        </button>
      </div>

      <div className="rd-frase">
        <Escolha titulo="Atributo" valor={comp.atributo.id} desabilitado={rolando} classe="rd-esc-termo"
          opcoes={personagem.atributos.map((a) => ({ id: a.id, rotulo: a.nome, valor: `+${a.valor}` }))}
          onEscolher={(id) => setTeste({ atributoId: id })}>
          <span className="rd-termo-nome">{comp.atributo.nome}</span><b className="rd-termo-v">+{comp.atributo.valor}</b>
        </Escolha>
        <span className="rd-mais" aria-hidden="true">+</span>
        <Escolha titulo="Perícia" valor={comp.pericia?.id ?? ""} desabilitado={rolando} classe="rd-esc-termo" alinhar="fim"
          opcoes={[{ id: "", rotulo: "Sem perícia" }, ...personagem.pericias.map((p) => ({ id: p.id, rotulo: p.nome, valor: `+${p.valor}` }))]}
          onEscolher={(id) => setTeste({ periciaId: id })}>
          <span className="rd-termo-nome">{comp.pericia?.nome ?? "Sem perícia"}</span>{comp.pericia && <b className="rd-termo-v">+{comp.pericia.valor}</b>}
        </Escolha>
      </div>

      <div className="rd-ajustes">
        <div className="rd-ajuste">
          <span className="rd-seg" role="group" aria-label="Contra o quê">
            <button type="button" aria-pressed={!contestado} onClick={() => setTeste({ alvoTipo: "cd" })}>CD</button>
            <button type="button" aria-pressed={contestado} onClick={() => setTeste({ alvoTipo: "contestado" })} title="Teste contestado: total do oponente">VS</button>
          </span>
          <Passo rotulo={contestado ? "Total do oponente" : "Classe de dificuldade"} min={1} max={99} vazioPermitido={!contestado}
            valor={contestado ? teste.oponente : teste.cd} testId="d-alvo"
            onChange={(v) => setTeste(contestado ? { oponente: v } : { cd: v })} />
        </div>
        <div className="rd-ajuste">
          <span className="rd-ajuste-rot">Mod</span>
          <Passo rotulo="Modificador" min={-9} max={9} sinal valor={String(teste.modificador)} onChange={(v) => setTeste({ modificador: Number(v) || 0 })} />
        </div>
      </div>

      {contestado && (
        <div className="rd-iniciou" role="group" aria-label="Quem iniciou a ação (empate vence quem iniciou)">
          <span className="rd-ajuste-rot">Iniciou</span>
          <span className="rd-seg is-largo">
            <button type="button" aria-pressed={teste.iniciou === "eu"} onClick={() => setTeste({ iniciou: "eu" })}><span>{s.nomeVisivel}</span></button>
            <button type="button" aria-pressed={teste.iniciou === "oponente"} onClick={() => setTeste({ iniciou: "oponente" })}>Oponente</button>
          </span>
        </div>
      )}

      <div className="rd-lancar">
        <span className="rd-pool" aria-label={s.magista ? "Dado Normal e Dado de Sobrecarga" : "Dado Normal"}>
          <span className={emVoo ? "rd-girando" : undefined} style={tremendo ? { display: "block", ...estiloTremor(s.carga, 0) } : { display: "block" }}>
            <PolyDie sides={10} semValor active accent={CIANO} soft="rgba(0,212,255,.14)" size={30} />
          </span>
          {s.magista && (
            <span className={`rd-pool-s${emVoo ? " rd-girando" : ""}`}
              style={{ display: "block", ...(tremendo ? estiloTremor(s.carga, 1) : null), ["--brilho" as string]: s.carga } as CSSProperties}>
              <PolyDie sides={10} semValor active accent={VIOLETA} soft="rgba(177,151,255,.16)" size={30} />
            </span>
          )}
        </span>
        <RollButton variante="f" label={rolando ? "Rolando…" : r ? "Rolar de novo" : "Rolar"} disabled={rolando} onRoll={s.rolar} onChargeChange={s.setCarga} />
      </div>
    </div>
  );
}

/* ── a barra ────────────────────────────────────────────────────────── */

function SuperficieD() {
  const s = useProto();
  const comp = useComposicao();
  const r = useRolagemDaJanela();
  const [previa, setPrevia] = useState(false);

  if (s.papel === "observa") {
    return (
      <p className="rp-observando" role="status">
        Vendo como outro jogador da mesa · a barra de quem rola não aparece aqui
      </p>
    );
  }

  // Com rolagem: a régua é a do teste CONGELADO (a ficha pode ter mudado depois).
  const faces = r ? Array.from({ length: 10 }, (_, i) => resolverTeste(parcelasDe(r.teste), r.teste.alvo, i + 1)) : comp.faces;
  const alvo = r ? r.teste.alvo : comp.alvo;
  const estado = !r ? "ocioso" : r.normal == null ? "rolando" : "pronto";
  const marca: Marca | null = r && r.normal != null ? { normal: r.normal, sobrecarga: r.sobrecarga, usado: usado(r) } : null;
  const podeTrocar = !!r && r.teste.magista && r.normal != null;
  // Mexer na composição depois de rolar volta a régua para a leitura das chances.
  const congelado = r && (r.teste.atributo.nome !== comp.atributo.nome || (r.teste.pericia?.nome ?? null) !== (comp.pericia?.nome ?? null)
    || r.teste.modificador !== comp.parcelas.modificador || JSON.stringify(r.teste.alvo) !== JSON.stringify(comp.alvo));

  return (
    <section className="rd-barra" aria-label="Rolar dados" data-testid="d-barra">
      <div className="rd-barra-in">
        <Compor />
        <div className="rd-painel" data-estado={congelado ? "ocioso" : estado}>
          <div className="rd-painel-topo">
            <Leitura r={congelado ? null : r} previa={previa} />
            {(r ? r.teste.magista : s.magista) && <Conduto realce={previa} />}
          </div>
          <Regua faces={congelado ? comp.faces : faces} alvo={congelado ? comp.alvo : alvo}
            marca={congelado ? null : marca} previa={previa} estado={congelado ? "ocioso" : estado}
            filhos={!congelado && r && podeTrocar ? <Etiqueta r={r} setPrevia={setPrevia} /> : null} />
        </div>
      </div>
    </section>
  );
}

/* ── chat ───────────────────────────────────────────────────────────── */

function CartaoD({ r }: { r: Rolagem }) {
  const s = useProto();
  const res = resolucao(r);
  const antes = resolucaoAntes(r);
  const faces = Array.from({ length: 10 }, (_, i) => resolverTeste(parcelasDe(r.teste), r.teste.alvo, i + 1));
  const cons = r.troca ? consequenciaDaTroca(r.troca) : null;
  return (
    <CartaoTeste r={r} paleta={PALETA} atributos={{ "data-trocado": trocada(r) ? "true" : "false" }}>
      <LinhaVeredito res={res} paleta={PALETA} r={r}
        antes={antes && (
          <span className="rd-c-antes" data-testid="cartao-antes">antes {antes.total} · {rotuloDaLeitura(antes)}{antes.margem != null ? ` ${margemTexto(antes.margem)}` : ""}</span>
        )} />
      <Regua mini faces={faces} alvo={r.teste.alvo} estado="pronto"
        marca={r.normal != null ? { normal: r.normal, sobrecarga: r.sobrecarga, usado: usado(r) } : null} />
      {trocada(r) && (
        <div className="rd-c-sobre" style={{ ["--tom" as string]: cons ? COR_TOM[cons.tom] : VIOLETA } as CSSProperties}>
          <span className="rd-c-losango" aria-hidden="true" />
          <span className="rd-c-sobre-txt"><b>Sobrecarga usada</b><span>{r.perdaPendente ? `${r.perdaPendente.d4}d4 rolando na mesa` : cons ? `${cons.titulo} · ${cons.detalhe}` : ""}</span></span>
          {s.papel === "rola" && (
            <button type="button" className="rd-c-desfazer rp-acao" onClick={() => s.desfazer(r.id)}>
              <Undo2 size={11} strokeWidth={2.2} aria-hidden="true" /> Desfazer
            </button>
          )}
        </div>
      )}
    </CartaoTeste>
  );
}

/* ── mesa 3D ────────────────────────────────────────────────────────── */

function reagir(r: Rolagem, mesa: MesaApi, trocou: boolean) {
  const c = mesa.controle.current;
  if (!c || !mesa.naMesa()) return;
  c.marcar(`${r.id}-sobrecarga`, trocou ? "usado" : "reserva");
  c.marcar(`${r.id}-normal`, trocou ? "apagado" : "neutro");
}

const Nada = () => null;

export const PROPOSTA_D: Proposta = {
  id: "d",
  letra: "D",
  nome: "Régua",
  classe: "pd",
  aparencias: {
    normal: { corpo: "metal", acento: CIANO },
    sobrecarga: () => ({
      corpo: "vidro", acento: VIOLETA, numero: "#f1ecff",
      luz: { cor: VIOLETA, repouso: 0.55, lancamento: 1.2, respiracao: 0.45 },
      fisica: { giro: 1.15 },
    }),
  },
  estadoSobrecarga: "reserva",
  aoTrocar: (r, mesa) => reagir(r, mesa, true),
  aoDesfazer: (r, mesa) => reagir(r, mesa, false),
  Pool: Nada,
  Resultado: Nada,
  Cartao: CartaoD,
  Superficie: SuperficieD,
};

export function PropostaD() {
  return <Prototipo proposta={PROPOSTA_D} />;
}

