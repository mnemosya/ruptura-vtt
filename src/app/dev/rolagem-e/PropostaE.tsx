"use client";

/**
 * PROPOSTA E — CARTA.
 *
 * Sem janela: o teste é uma carta no pé do palco. Na frente ela se
 * monta (perícia como título, atributo, a conta, a CD); ao rolar, ela
 * VIRA e mostra o Dado Normal. Para o magista, a carta do Dado de
 * Sobrecarga desliza de trás dela e fica ao lado, com o preço num selo
 * no canto — o que se perde ao usá-la. A carta que vale fica levantada;
 * trocar é levantar a outra, desfazer é levantar a primeira de volta.
 *
 * A mesa vê a mesma coisa: quem observa recebe as cartas de quem rolou
 * (só leitura), que se recolhem sozinhas depois de um tempo parado.
 *
 * Cor: o Sobrecarga tem a cor do PREÇO (violeta +1, magenta Ruptura,
 * vermelho Integridade) — no selo, na moldura e na luz do dado na mesa.
 * Âmbar fica nas faixas limitadas e na carga.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Lock, PencilLine, Undo2, Users } from "lucide-react";
import { PolyDie } from "../../mesas/[campaignId]/vtt/_dados3d/PolyDie";
import { RollButton } from "../../mesas/[campaignId]/vtt/_dados3d/ResultadoRolagem";
import { Chevron } from "../../mesas/[campaignId]/vtt/_dados3d/icones";
import { Prototipo } from "../rolagem/_base/Prototipo";
import { estiloTremor } from "../rolagem/_base/Janela";
import {
  resolucao, resolucaoAntes, trocada, usado, useProto, useRolagemDaJanela, type Proposta, type Rolagem,
} from "../rolagem/_base/estado";
import { CartaoTeste, LinhaVeredito, PALETA_ATUAL, corDaLeitura, margemTexto, rotuloDaLeitura } from "../rolagem/_base/pecas";
import { custoDaTroca, type CustoTroca, type Resolucao } from "../rolagem/_base/regra";
import type { MesaApi } from "../rolagem/_base/MesaDupla";
import {
  Escolha, Passo, consequenciaDaTroca, precoDaTroca, tomDoCusto, useComposicao, type TomPreco,
} from "../rolagem/_base/compor";

const CIANO = "#00d4ff";
const PALETA = PALETA_ATUAL;
const COR_TOM: Record<TomPreco, string> = { ponto: "#9d8cff", ruptura: "#ff4fd8", integridade: "#ff5f74", ultima: "#ff5f74" };
const RECOLHER_OBSERVADOR_MS = 6000;

function corDe(res: Resolucao | null): string {
  return corDaLeitura(res, PALETA).hex;
}

/** O que se perde ao usar a carta: o número do selo. */
function seloDoCusto(c: CustoTroca): string {
  if (c.faixa === "abaixo") return "+1";
  if (c.faixa === "alcanca") return `−${c.perdaIntegridade}`;
  return `${c.d4}d4`;
}

function alvoCurto(r: Rolagem): { rot: string; v: string } | null {
  const a = r.teste.alvo;
  return a.tipo === "cd" ? { rot: "CD", v: String(a.cd) } : a.tipo === "contestado" ? { rot: "VS", v: String(a.oponente) } : null;
}

/* ── peças de carta ─────────────────────────────────────────────────── */

function Gema({ rot, v }: { rot: string; v: string }) {
  return (
    <span className="re-gema" aria-label={`${rot} ${v}`}>
      <span className="re-gema-rot" aria-hidden="true">{rot}</span>
      <span className="re-gema-pedra" aria-hidden="true"><b>{v}</b></span>
    </span>
  );
}

/** Miolo de uma carta de resultado: total, veredito, conta. */
function Miolo({ r, res, natureza }: { r: Rolagem; res: Resolucao; natureza: "normal" | "sobrecarga" }) {
  const cor = corDe(res);
  const Icone = corDaLeitura(res, PALETA).Icone;
  const t = r.teste;
  return (
    <div className="re-miolo" style={{ ["--cor" as string]: cor } as CSSProperties}>
      <span className="re-total" data-testid={natureza === "normal" ? "e-total-normal" : "e-total-sobre"}>{res.total}</span>
      <span className="re-veredito">
        <Icone width={15} height={15} aria-hidden="true" />
        <span className="re-veredito-nome">{rotuloDaLeitura(res)}</span>
        {res.margem != null && <b>{margemTexto(res.margem)}</b>}
      </span>
      <span className="re-conta">
        d10 <b>{res.dado}</b> + {t.atributo.nome.toLowerCase()} {t.atributo.valor}
        {t.pericia ? ` + ${t.pericia.nome.toLowerCase()} ${t.pericia.valor}` : ""}
        {t.modificador ? ` ${t.modificador > 0 ? "+" : "−"} ${Math.abs(t.modificador)}` : ""}
      </span>
    </div>
  );
}

/* ── frente: a carta se monta ───────────────────────────────────────── */

function Frente() {
  const s = useProto();
  const comp = useComposicao();
  const { personagem, teste, setTeste, rolando } = s;
  const contestado = teste.alvoTipo === "contestado";
  return (
    <div className="re-frente-in">
      <header className="re-cab">
        <Escolha titulo="Rolando como" valor={personagem.id} desabilitado={rolando} classe="re-esc-quem" lado="cima"
          opcoes={s.personagens.map((p) => ({ id: p.id, rotulo: s.nomeLongo && p.id === personagem.id ? p.nomeLongo : p.nome, valor: (p.id === personagem.id ? s.magista : p.magista) ? "Magista" : "PJ" }))}
          onEscolher={s.escolherPersonagem}>
          <span className="re-av" aria-hidden="true">{personagem.sigla}</span>
          <span className="re-quem-nome">{s.nomeVisivel}</span>
          <Chevron width={13} height={13} strokeWidth={2} aria-hidden="true" />
        </Escolha>
        <button type="button" className="re-visib" aria-label={`Quem vê: ${teste.visibilidade === "public" ? "a mesa" : "só você"}. Alternar`}
          title={teste.visibilidade === "public" ? "A mesa toda vê" : "Só você vê"}
          onClick={() => setTeste({ visibilidade: teste.visibilidade === "public" ? "private" : "public" })}>
          {teste.visibilidade === "public" ? <Users size={14} strokeWidth={1.9} /> : <Lock size={14} strokeWidth={1.9} />}
        </button>
      </header>

      <span className="re-tipo">{comp.pericia ? "Teste de perícia" : "Teste de atributo"}</span>
      <Escolha titulo="Perícia" valor={comp.pericia?.id ?? ""} desabilitado={rolando} classe="re-esc-titulo" lado="cima"
        opcoes={[{ id: "", rotulo: "Sem perícia" }, ...personagem.pericias.map((p) => ({ id: p.id, rotulo: p.nome, valor: `+${p.valor}` }))]}
        onEscolher={(id) => setTeste({ periciaId: id })}>
        <span className="re-titulo">{comp.pericia?.nome ?? comp.atributo.nome}</span>
        {comp.pericia && <b className="re-titulo-v">+{comp.pericia.valor}</b>}
        <Chevron width={14} height={14} strokeWidth={2} aria-hidden="true" />
      </Escolha>

      <div className="re-atributos" role="radiogroup" aria-label="Atributo">
        {personagem.atributos.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={a.id === comp.atributo.id} disabled={rolando}
            onClick={() => setTeste({ atributoId: a.id })}>
            <span>{a.nome}</span><b>+{a.valor}</b>
          </button>
        ))}
      </div>

      <div className="re-formula" aria-label={`d10 mais ${comp.base}: de ${comp.base + 1} a ${comp.base + 10}`}>
        <span className="re-formula-d">d10</span>
        <span className="re-formula-op">{comp.base >= 0 ? "+" : "−"}</span>
        <span className="re-formula-n">{Math.abs(comp.base)}</span>
        <span className="re-formula-faixa">{comp.base + 1}–{comp.base + 10}</span>
      </div>

      <div className="re-ajustes">
        <div className="re-ajuste">
          <span className="re-seg" role="group" aria-label="Contra o quê">
            <button type="button" aria-pressed={!contestado} onClick={() => setTeste({ alvoTipo: "cd" })}>CD</button>
            <button type="button" aria-pressed={contestado} onClick={() => setTeste({ alvoTipo: "contestado" })} title="Teste contestado: total do oponente">VS</button>
          </span>
          <Passo rotulo={contestado ? "Total do oponente" : "Classe de dificuldade"} min={1} max={99} vazioPermitido={!contestado}
            valor={contestado ? teste.oponente : teste.cd} testId="e-alvo"
            onChange={(v) => setTeste(contestado ? { oponente: v } : { cd: v })} />
        </div>
        <div className="re-ajuste">
          <span className="re-rot">Mod</span>
          <Passo rotulo="Modificador" min={-9} max={9} sinal valor={String(teste.modificador)} onChange={(v) => setTeste({ modificador: Number(v) || 0 })} />
        </div>
        {contestado && (
          <div className="re-ajuste is-largo" role="group" aria-label="Quem iniciou a ação (empate vence quem iniciou)">
            <span className="re-rot">Iniciou</span>
            <span className="re-seg is-largo">
              <button type="button" aria-pressed={teste.iniciou === "eu"} onClick={() => setTeste({ iniciou: "eu" })}><span>{s.nomeVisivel}</span></button>
              <button type="button" aria-pressed={teste.iniciou === "oponente"} onClick={() => setTeste({ iniciou: "oponente" })}>Oponente</button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── verso: o Dado Normal ───────────────────────────────────────────── */

function VersoNormal({ r, observa }: { r: Rolagem | null; observa: boolean }) {
  if (!r) return null;
  const res = resolucao(r, "normal");
  const alvo = alvoCurto(r);
  return (
    <div className="re-verso-in">
      <header className="re-cab">
        <span className="re-dado-rot">
          <PolyDie sides={10} value={r.normal ?? undefined} semValor={r.normal == null} active accent={CIANO} soft="rgba(0,212,255,.14)" size={24} />
          <span>{observa ? r.teste.nome : "Dado Normal"}</span>
        </span>
        {alvo && <Gema {...alvo} />}
      </header>
      <span className="re-tipo">{observa ? `Dado Normal · ${r.teste.pericia?.nome ?? r.teste.atributo.nome}` : `${r.teste.nome} · ${r.teste.pericia?.nome ?? r.teste.atributo.nome}`}</span>
      {res ? <Miolo r={r} res={res} natureza="normal" /> : (
        <div className="re-miolo is-rolando" aria-live="polite"><span className="re-girando-grande" aria-hidden="true"><PolyDie sides={10} semValor active accent={CIANO} soft="rgba(0,212,255,.1)" size={72} /></span><span className="re-veredito">Rolando</span></div>
      )}
    </div>
  );
}

/* ── a carta do Sobrecarga ──────────────────────────────────────────── */

function CartaSobre({ r, observa }: { r: Rolagem; observa: boolean }) {
  const s = useProto();
  const res = r.sobrecarga != null ? resolucao(r, "sobrecarga") : null;
  const vale = usado(r) === "sobrecarga";
  // Preço: o de agora antes da troca; depois, o que aconteceu.
  const preco = precoDaTroca(s.custo);
  const cons = r.troca ? consequenciaDaTroca(r.troca) : null;
  const tom: TomPreco = cons ? cons.tom : r.perdaPendente ? "integridade" : preco.tom;
  const selo = r.troca ? seloDoCusto(r.troca.custo) : r.perdaPendente ? `${r.perdaPendente.d4}d4` : seloDoCusto(s.custo);
  const alvo = alvoCurto(r);
  const pode = !observa && !vale && res != null && s.papel === "rola";
  const conteudo: ReactNode = (
    <>
      <span className="re-selo" aria-hidden="true" data-testid="e-selo"><b>{selo}</b></span>
      <header className="re-cab">
        <span className="re-dado-rot is-sobre">
          <PolyDie sides={10} value={r.sobrecarga ?? undefined} semValor={r.sobrecarga == null} active accent={COR_TOM[tom]} soft="rgba(157,140,255,.14)" size={24} />
          <span>Sobrecarga</span>
        </span>
        {alvo && <Gema {...alvo} />}
      </header>
      <span className="re-tipo">{observa ? `${r.teste.nome} decide` : vale ? "Em uso" : "Pode trocar"}</span>
      {res ? <Miolo r={r} res={res} natureza="sobrecarga" /> : (
        <div className="re-miolo is-rolando" aria-live="polite"><span className="re-girando-grande" aria-hidden="true"><PolyDie sides={10} semValor active accent={COR_TOM[tom]} soft="rgba(157,140,255,.1)" size={72} /></span><span className="re-veredito">No ar</span></div>
      )}
      <span className="re-preco" data-pendente={r.perdaPendente ? "true" : undefined}>
        {vale ? (
          <>
            <b>{r.perdaPendente ? `${r.perdaPendente.d4}d4 rolando na mesa` : cons?.titulo}</b>
            <span data-testid="e-consequencia">{r.perdaPendente ? "a Integridade cai quando assentarem" : cons?.detalhe}</span>
          </>
        ) : (
          <>
            <b>{preco.titulo}</b>
            <span>{preco.detalhe}</span>
          </>
        )}
      </span>
    </>
  );
  const estilo = { ["--tom" as string]: COR_TOM[tom] } as CSSProperties;
  if (pode) {
    return (
      <button type="button" className="re-carta re-sobre" data-vale="false" style={estilo} data-testid="e-usar"
        onClick={() => void s.trocar(r.id)}
        aria-label={`Usar o Dado de Sobrecarga: ${res?.total} ${rotuloDaLeitura(res)}. Custo: ${preco.titulo}, ${preco.detalhe}`}>
        <span className="re-face">{conteudo}<span className="re-usar" aria-hidden="true">Usar esta</span></span>
      </button>
    );
  }
  return (
    <div className="re-carta re-sobre" data-vale={vale ? "true" : "false"} data-voo={res == null || undefined} style={estilo}>
      <span className="re-face">{conteudo}</span>
    </div>
  );
}

/* ── a mão ──────────────────────────────────────────────────────────── */

function SuperficieE() {
  const s = useProto();
  const minha = useRolagemDaJanela();
  const observa = s.papel === "observa";
  // Quem observa recebe a última rolagem da mesa, de quem for.
  const ultimaMesa = s.rolagens.at(-1) ?? null;
  const r = observa ? ultimaMesa : minha;
  const [editando, setEditando] = useState(false);
  const [recolhida, setRecolhida] = useState(false);

  // Rolou: a carta vira. Editar volta a frente.
  const chave = r ? `${r.id}:${r.fase}:${usado(r)}:${r.perdaPendente ? 1 : 0}` : "";
  useEffect(() => { setEditando(false); setRecolhida(false); }, [r?.id]);
  useEffect(() => {
    if (!observa || !r || r.fase !== "completa") return;
    setRecolhida(false);
    const t = setTimeout(() => setRecolhida(true), RECOLHER_OBSERVADOR_MS);
    return () => clearTimeout(t);
  }, [observa, chave, r]);

  if (observa && !r) return null;
  const virada = observa || (!!r && !editando);
  const par = virada && !!r && r.teste.magista;
  const vale = r ? usado(r) : "normal";
  const tremendo = s.carga > 0 && !s.rolando;

  if (observa && recolhida && r) {
    const res = resolucao(r);
    return (
      <div className="re-mao is-observa">
        <button type="button" className="re-recolhida rp-acao" onClick={() => setRecolhida(false)} data-testid="e-recolhida"
          style={{ ["--cor" as string]: corDe(res) } as CSSProperties}>
          <span className="re-av" aria-hidden="true">{r.teste.sigla}</span>
          <span><b>{res?.total ?? "—"}</b> {rotuloDaLeitura(res)}</span>
          {trocada(r) && <span className="re-recolhida-s" aria-label="com Sobrecarga" />}
        </button>
      </div>
    );
  }

  return (
    <div className="re-mao" data-par={par || undefined} data-observa={observa || undefined} data-testid="e-mao">
      <div className="re-par">
        {/* A carta do teste: frente (montar) e verso (o Dado Normal). */}
        <div className="re-carta re-principal" data-virada={virada || undefined} data-vale={!par || vale === "normal" ? "true" : "false"}
          style={{ ["--tom" as string]: CIANO } as CSSProperties}>
          <div className="re-giro">
            <div className="re-face re-frente" data-oculta={virada || undefined} inert={virada || observa ? true : undefined}>
              {!observa && <Frente />}
            </div>
            <div className="re-face re-verso" data-oculta={!virada || undefined} inert={!virada ? true : undefined}>
              <VersoNormal r={r} observa={observa} />
            </div>
          </div>
          {/* Com o Sobrecarga valendo, a carta do Normal baixada é o desfazer. */}
          {par && r && vale === "sobrecarga" && !observa && (
            <button type="button" className="re-voltar" onClick={() => s.desfazer(r.id)} data-testid="e-desfazer"
              aria-label="Voltar ao Dado Normal (desfazer a troca)">
              <span><Undo2 size={13} strokeWidth={2.2} aria-hidden="true" /> Voltar a esta</span>
            </button>
          )}
        </div>
        {r && r.teste.magista && (
          <div className="re-vaga" data-aberta={par || undefined} inert={!par ? true : undefined}>
            <CartaSobre r={r} observa={observa} />
          </div>
        )}
      </div>

      {!observa && (
        <div className="re-acoes">
          {virada && r && (
            <button type="button" className="re-editar rp-acao" onClick={() => setEditando(true)} disabled={s.rolando} data-testid="e-editar">
              <PencilLine size={13} strokeWidth={2} aria-hidden="true" /> Editar teste
            </button>
          )}
          <span className="re-pool" aria-label={s.magista ? "Dado Normal e Dado de Sobrecarga" : "Dado Normal"}>
            <span className={s.rolando ? "re-girando" : undefined} style={tremendo ? { display: "block", ...estiloTremor(s.carga, 0) } : { display: "block" }}>
              <PolyDie sides={10} semValor active accent={CIANO} soft="rgba(0,212,255,.14)" size={26} />
            </span>
            {s.magista && (
              <span className={`re-pool-s${s.rolando ? " re-girando" : ""}`}
                style={{ display: "block", ...(tremendo ? estiloTremor(s.carga, 1) : null), ["--brilho" as string]: s.carga, ["--tom" as string]: COR_TOM[tomDoCusto(s.custo)] } as CSSProperties}>
                <PolyDie sides={10} semValor active accent={COR_TOM[tomDoCusto(s.custo)]} soft="rgba(157,140,255,.16)" size={26} />
              </span>
            )}
          </span>
          <RollButton variante="f" label={s.rolando ? "Rolando…" : virada && r ? "Rolar de novo" : "Rolar"} disabled={s.rolando}
            onRoll={(f) => { setEditando(false); s.rolar(f); }} onChargeChange={s.setCarga} />
        </div>
      )}
    </div>
  );
}

/* ── chat ───────────────────────────────────────────────────────────── */

function Mini({ r, natureza }: { r: Rolagem; natureza: "normal" | "sobrecarga" }) {
  const res = resolucao(r, natureza);
  const vale = usado(r) === natureza;
  const cor = corDe(res);
  return (
    <span className="re-mini" data-vale={vale || undefined} data-natureza={natureza} style={{ ["--cor" as string]: cor } as CSSProperties}>
      <span className="re-mini-rot"><span>{natureza === "normal" ? "Normal" : "Sobrecarga"}</span><i>d10 {natureza === "normal" ? r.normal : r.sobrecarga}</i></span>
      <span className="re-mini-v"><b>{res?.total ?? "—"}</b>{res?.margem != null ? margemTexto(res.margem) : ""}</span>
    </span>
  );
}

function CartaoE({ r }: { r: Rolagem }) {
  const s = useProto();
  const res = resolucao(r);
  const antes = resolucaoAntes(r);
  const cons = r.troca ? consequenciaDaTroca(r.troca) : null;
  return (
    <CartaoTeste r={r} paleta={PALETA} atributos={{ "data-trocado": trocada(r) ? "true" : "false" }}>
      <LinhaVeredito res={res} paleta={PALETA} r={r}
        antes={antes && (
          <span className="re-c-antes" data-testid="cartao-antes">antes {antes.total} · {rotuloDaLeitura(antes)}{antes.margem != null ? ` ${margemTexto(antes.margem)}` : ""}</span>
        )} />
      {r.teste.magista && (
        <div className="re-c-par">
          <Mini r={r} natureza="normal" />
          <Mini r={r} natureza="sobrecarga" />
        </div>
      )}
      {trocada(r) && (
        <div className="re-c-sobre" style={{ ["--tom" as string]: COR_TOM[cons?.tom ?? "integridade"] } as CSSProperties}>
          <span className="re-c-sobre-txt">
            <b>{r.perdaPendente ? `${r.perdaPendente.d4}d4 rolando` : cons?.titulo}</b>
            <span>{r.perdaPendente ? "Integridade quando assentarem" : cons?.detalhe}</span>
          </span>
          {s.papel === "rola" && (
            <button type="button" className="re-c-desfazer rp-acao" onClick={() => s.desfazer(r.id)}>
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

export const PROPOSTA_E: Proposta = {
  id: "e",
  letra: "E",
  nome: "Carta",
  classe: "pe",
  aparencias: {
    normal: { corpo: "metal", acento: CIANO },
    // A brasa na cor do preço da próxima troca.
    sobrecarga: (c) => {
      const cor = COR_TOM[tomDoCusto(custoDaTroca(c))];
      return {
        corpo: "brasa", acento: cor, numero: "#fff1fb",
        luz: { cor, repouso: 0.55, lancamento: 1.2, respiracao: tomDoCusto(custoDaTroca(c)) === "ponto" ? 0.4 : 0.9 },
        fisica: { giro: 1.2 },
      };
    },
    perda: { corpo: "metal", acento: "#ff5f74" },
  },
  estadoSobrecarga: "reserva",
  perdaNaMesa: true,
  aoTrocar: (r, mesa) => reagir(r, mesa, true),
  aoDesfazer: (r, mesa) => reagir(r, mesa, false),
  Pool: Nada,
  Resultado: Nada,
  Cartao: CartaoE,
  Superficie: SuperficieE,
};

export function PropostaE() {
  return <Prototipo proposta={PROPOSTA_E} />;
}
