"use client";

/**
 * Índice pessoal de personagens (área autenticada global), no layout da
 * V1 "Seco": totais por estado no topo, abas de estado, busca e "Criar
 * personagem"; uma grade de cards com retrato e, ao lado, o painel do
 * personagem selecionado com a ação certa para o estado.
 *
 * O estado — em campanha, sem campanha ou aguardando o narrador — pinta a
 * faixa do card e o painel com a mesma cor (ciano / cinza / âmbar) e
 * decide a ação: abrir ficha · enviar para campanha · cancelar pedido.
 *
 * "Criar personagem" abre a Forja sem campanha. "Enviar para campanha"
 * abre um diálogo com as campanhas da conta: o pedido fica pendente até
 * o narrador aceitar (quem narra o destino entra direto). Ao sair de uma
 * campanha, o personagem volta para cá como "sem campanha".
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { capaDaCampanha, relativeTime } from "../../_global/parts";
import type { Campaign } from "../../../../lib/table";
import { AlertTriangle, RotateCw, Search, Spinner, X } from "../../../_design/icons";
import { usePresence } from "../../../_design/usePresence";
import { useCamada } from "../../../_design/camadas";
import { JanelaNovoPersonagem } from "../../[campaignId]/vtt/_painel/janelas/JanelaNovoPersonagem";
import { cancelarPedidoAction, enviarParaCampanhaAction } from "./acoes";

export interface PersonagemLinha {
  id: string;
  name: string;
  classe: string | null;
  ranking: string | null;
  avatarUrl: string | null;
  /** Campanha onde o personagem está; nulo = sem campanha. */
  campanha: { id: string; nome: string; role: "narrator" | "player" } | null;
  /** Pedido de entrada aguardando o narrador (só personagem sem campanha). */
  pendente: { campaignId: string; campaignName: string } | null;
  updatedAt: string;
}

export interface CampanhaDestino {
  id: string;
  nome: string;
  /** Quem narra o destino não precisa pedir: o personagem entra direto. */
  narra: boolean;
  /** O que a miniatura da linha precisa (`capaDaCampanha`). */
  capa?: Pick<Campaign, "id" | "regiao" | "cover_path">;
}

type Estado = "campanha" | "solto" | "pendente";
type Filtro = "todos" | Estado;

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "campanha", label: "Em campanha" },
  { id: "solto", label: "Sem campanha" },
  { id: "pendente", label: "Pendentes" },
];

const NOME_CLASSE: Record<string, string> = {
  ancora: "Âncora", cacador: "Caçador", combatente: "Combatente", face: "Face",
  infiltrador: "Infiltrador", tecnico: "Técnico", vanguarda: "Vanguarda",
};

const ROTULO_ESTADO: Record<Estado, string> = { campanha: "Em campanha", solto: "Sem campanha", pendente: "Pendente" };

const estadoDe = (p: PersonagemLinha): Estado => (p.campanha ? "campanha" : p.pendente ? "pendente" : "solto");

const hrefDaFicha = (p: PersonagemLinha) =>
  p.campanha ? `/ficha?campaignId=${p.campanha.id}&characterId=${p.id}` : `/ficha?characterId=${p.id}`;

function IconeMais({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function Seta() {
  return <svg className="v1-seta" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} aria-hidden="true"><path d="M8 4l8 8-8 8" /></svg>;
}

/** Retrato do personagem, ou a reserva (só a silhueta) quando não tem avatar. */
function Rosto({ p, classe }: { p: PersonagemLinha; classe: string }) {
  if (p.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={classe} src={p.avatarUrl} alt="" />;
  }
  return (
    <span className={`${classe} v1-pg-reserva`} aria-hidden="true">
      <svg viewBox="0 0 64 88"><circle cx="32" cy="34" r="12" /><path d="M8 88 C10 64 20 54 32 54 C44 54 54 64 56 88 Z" /></svg>
    </span>
  );
}

export default function PersonagensGlobaisClient({
  personagens,
  destinos = [],
  errorInicial,
}: {
  personagens: PersonagemLinha[];
  destinos?: CampanhaDestino[];
  errorInicial: string | null;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [criando, setCriando] = useState(false);
  const [enviando, setEnviando] = useState<PersonagemLinha | null>(null);
  const [selId, setSelId] = useState<string | null>(personagens[0]?.id ?? null);
  /** Cresce a cada filtro/busca: os cards entram de novo em cascata. */
  const [lista, setLista] = useState(0);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return personagens.filter((p) => {
      if (filtro !== "todos" && estadoDe(p) !== filtro) return false;
      return !q || p.name.toLowerCase().includes(q) || (p.campanha?.nome ?? "").toLowerCase().includes(q);
    });
  }, [personagens, filtro, busca]);

  const contagem = useMemo(() => {
    const c = { campanha: 0, solto: 0, pendente: 0 };
    personagens.forEach((p) => { c[estadoDe(p)]++; });
    return c;
  }, [personagens]);

  // A seleção sobrevive ao refresh; se o personagem sumiu, volta ao primeiro.
  useEffect(() => {
    if (!selId || !personagens.some((p) => p.id === selId)) setSelId(personagens[0]?.id ?? null);
  }, [personagens, selId]);

  const selecionado = personagens.find((p) => p.id === selId) ?? null;
  const mudarFiltro = (f: Filtro) => { setFiltro(f); setLista((n) => n + 1); };

  return (
    <main className="v1-pg">
      {criando && (
        <JanelaNovoPersonagem campaignId={null} onFechar={() => setCriando(false)} onAbrirFicha={() => router.refresh()} />
      )}
      <DialogoEnviar p={enviando} destinos={destinos} onFechar={() => setEnviando(null)} />

      <div className="v1-pg-col">
        <div className="v1-pg-cab v1-e1">
          <div className="v1-pg-cab-titulo">
            <span className="v1-pg-sobrancelha">Registro de refratários · {personagens.length} {personagens.length === 1 ? "ficha" : "fichas"}</span>
            <h1 className="v1-glitch-a v1-pg-titulo">Personagens</h1>
          </div>
          <div className="v1-pg-contagens">
            {([["campanha", "Em campanha"], ["solto", "Sem campanha"], ["pendente", "Pendentes"]] as const).map(([k, rot], i) => (
              <div key={k} className={`v1-desliza-a v1-pg-contagem v1-pg-contagem--${k}`} style={{ animationDelay: `${0.1 + i * 0.06}s` }}>
                <span className="v1-pg-contagem-n">{contagem[k]}</span>
                <span className="v1-pg-contagem-rot">{rot}</span>
              </div>
            ))}
          </div>
        </div>

        {errorInicial && (
          <div className="v1-estado v1-estado--erro" role="alert">
            <AlertTriangle size={30} />
            <span className="v1-estado-titulo">Falha ao carregar personagens</span>
            <span className="v1-estado-txt">{errorInicial}</span>
            <button type="button" className="v1-u v1-ghost v1-btn-contorno" onClick={() => router.refresh()}>
              <RotateCw size={13} /> Tentar novamente
            </button>
          </div>
        )}

        {!errorInicial && personagens.length === 0 && <VazioPersonagens onCriar={() => setCriando(true)} />}

        {!errorInicial && personagens.length > 0 && (
          <>
            <div className="v1-barra v1-e2">
              <div className="v1-abas" role="tablist" aria-label="Filtrar por estado">
                {FILTROS.map((f) => (
                  <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} onClick={() => mudarFiltro(f.id)}
                    className={`v1-u v1-sub v1-aba v1-aba--peq${filtro === f.id ? " on" : ""}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="v1-barra-vao" />
              <label className="v1-busca v1-busca--pg">
                <Search size={14} strokeWidth={2.5} aria-hidden="true" />
                <span className="sr-only">Buscar personagens</span>
                <input id="busca-personagens" data-testid="personagens-busca" type="search" className="v1-u" value={busca}
                  onChange={(e) => { setBusca(e.target.value); setLista((n) => n + 1); }} placeholder="Buscar personagem ou campanha" />
              </label>
              <button type="button" className="v1-u v1-ghost v1-btn-criar" data-testid="personagens-criar" onClick={() => setCriando(true)}>
                <IconeMais /> Criar personagem
              </button>
            </div>

            {filtrados.length === 0 ? (
              <div className="v1-estado v1-carta-a">
                <span className="v1-estado-titulo">Nenhum personagem</span>
                <span className="v1-estado-txt">{busca.trim() ? <>Nada com “{busca.trim()}”</> : "Nenhum neste filtro"}</span>
                <button type="button" className="v1-u v1-ghost v1-btn-contorno" onClick={() => { setBusca(""); mudarFiltro("todos"); }}>Limpar filtros</button>
              </div>
            ) : (
              <ul className="v1-pg-grade" data-testid="personagens-lista">
                {filtrados.map((p, i) => {
                  const estado = estadoDe(p), sel = p.id === selId;
                  return (
                    <li key={`${p.id}-${lista}`} className="v1-carta-a" style={{ animationDelay: `${(0.12 + i * 0.03).toFixed(2)}s` }}>
                      <div className={`v1-card v1-pc${sel ? " is-sel" : ""}`} data-estado={estado} data-testid="personagem-item">
                        <button type="button" className="v1-u v1-sel" onClick={() => setSelId(p.id)} aria-pressed={sel} aria-label={`Selecionar ${p.name}`}>
                          <Rosto p={p} classe="v1-arte" />
                          <span className="v1-pc-veu" aria-hidden="true" />
                          <span className="v1-canto v1-c1" aria-hidden="true" /><span className="v1-canto v1-c2" aria-hidden="true" />
                          <span className="v1-canto v1-c3" aria-hidden="true" /><span className="v1-canto v1-c4" aria-hidden="true" />
                          <span className="v1-faixa" aria-hidden="true" />
                          <span className="v1-pc-texto">
                            <span className="v1-pc-estado" data-testid={estado === "pendente" ? "personagem-pendente" : undefined}>◆ {ROTULO_ESTADO[estado]}</span>
                            <span className="v1-pc-nome" title={p.name}>{p.name}</span>
                            <span className="v1-pc-meta">{[p.classe ? NOME_CLASSE[p.classe] ?? p.classe : null, p.ranking ? `Rank ${p.ranking}` : null].filter(Boolean).join(" · ") || "—"}</span>
                            <span className="v1-pc-lugar">{p.campanha ? p.campanha.nome : p.pendente ? `Aguardando ${p.pendente.campaignName}` : "Sem campanha"}</span>
                          </span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {!errorInicial && selecionado && (
        <PainelPersonagem key={selecionado.id} p={selecionado} onEnviar={() => setEnviando(selecionado)} />
      )}
    </main>
  );
}

function PainelPersonagem({ p, onEnviar }: { p: PersonagemLinha; onEnviar: () => void }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const estado = estadoDe(p);
  const classe = p.classe ? NOME_CLASSE[p.classe] ?? p.classe : null;

  const cancelar = async () => {
    setOcupado(true); setErro(null);
    const r = await cancelarPedidoAction(p.id);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    router.refresh();
  };

  const linhas: [string, string, string?][] = [
    ["Classe", classe ?? "—"],
    ["Rank", p.ranking ?? "—"],
    ["Campanha", p.campanha ? p.campanha.nome : p.pendente ? p.pendente.campaignName : "Sem campanha", p.campanha ? undefined : p.pendente ? "am" : "apagado"],
    ["Papel", p.campanha ? (p.campanha.role === "narrator" ? "◆ Narrador" : "◆ Jogador") : "—", p.campanha ? (p.campanha.role === "narrator" ? "am" : "cy") : "apagado"],
    ["Atualizado", relativeTime(p.updatedAt)],
  ];

  return (
    <aside className="v1-pg-lado v1-e3" aria-label="Personagem selecionado">
      <section className="v1-pd" data-estado={estado}>
        <div className="v1-pd-arte">
          <Rosto p={p} classe="v1-pd-img v1-wipe-a" />
          <div className="v1-pd-veu" aria-hidden="true" />
          <span className="v1-desliza-a v1-d1 v1-pd-estado">◆ {ROTULO_ESTADO[estado]}</span>
          <div className="v1-pd-nome-bloco">
            <h2 className="v1-glitch-a v1-pd-nome">{p.name}</h2>
            <span className="v1-desliza-a v1-d2 v1-pd-meta">{[classe, p.ranking ? `Rank ${p.ranking}` : null].filter(Boolean).join(" · ") || "—"}</span>
          </div>
        </div>
        <div className="v1-pd-corpo">
          <dl className="v1-desliza-a v1-d3 v1-pd-linhas">
            {linhas.map(([k, v, cor]) => (
              <div key={k} className="v1-pd-linha"><dt>{k}</dt><dd data-cor={cor}>{v}</dd></div>
            ))}
          </dl>
          {estado === "pendente" && p.pendente && (
            <div className="v1-pd-aviso"><span className="v1-carregando" aria-hidden="true">●</span>Aguardando o narrador de {p.pendente.campaignName}</div>
          )}
          {erro && <span role="alert" className="v1-campo-erro">{erro}</span>}
          <div className="v1-pd-acoes">
            {estado === "campanha" && (
              <Link href={hrefDaFicha(p)} className="v1-criar v1-pd-primario" aria-label={`Abrir a ficha de ${p.name}`}>
                <Seta /> Abrir ficha
              </Link>
            )}
            {estado === "solto" && (
              <button type="button" className="v1-u v1-criar v1-pd-primario v1-pd-primario--am" onClick={onEnviar} data-testid="personagem-enviar">
                <Seta /> Enviar para campanha
              </button>
            )}
            {estado === "pendente" && (
              <button type="button" className="v1-u v1-ghost v1-pd-secundario v1-pd-secundario--am" onClick={() => void cancelar()} disabled={ocupado}>
                {ocupado ? <Spinner size={13} className="mo-spin" /> : null} Cancelar pedido
              </button>
            )}
            {estado !== "campanha" && (
              <Link href={hrefDaFicha(p)} className="v1-ghost v1-pd-secundario" aria-label={`Abrir a ficha de ${p.name}`}>Abrir ficha</Link>
            )}
          </div>
        </div>
      </section>
    </aside>
  );
}

function VazioPersonagens({ onCriar }: { onCriar: () => void }) {
  const vagas = [0, 1, 2, 3, 4];
  return (
    <section className="v1-pg-vazio" aria-label="Nenhum personagem" data-testid="personagens-vazio">
      <span className="v1-pg-vazio-varredura" aria-hidden="true" />
      <span className="v1-pg-vazio-canto v1-pg-vazio-canto--1" aria-hidden="true" /><span className="v1-pg-vazio-canto v1-pg-vazio-canto--2" aria-hidden="true" />
      <span className="v1-pg-vazio-canto v1-pg-vazio-canto--3" aria-hidden="true" /><span className="v1-pg-vazio-canto v1-pg-vazio-canto--4" aria-hidden="true" />
      <div className="v1-pg-vazio-corpo">
        <div className="v1-pg-vagas" aria-hidden="true">
          {vagas.map((i) => {
            const meio = i === 2;
            return (
              <div key={i} className="v1-pg-vaga-flutua" style={{ animationDelay: `${(1.2 + i * 0.35).toFixed(2)}s` }}>
                <div className={`v1-pop-a v1-pg-vaga${meio ? " v1-pg-vaga--meio" : ""}${i % 2 ? " v1-pg-vaga--alta" : ""}`}
                  style={{ animationDelay: `${(0.35 + Math.abs(i - 2) * 0.09).toFixed(2)}s` }}>
                  <svg viewBox="0 0 64 88"><circle cx="32" cy="34" r="12" /><path d="M8 88 C10 64 20 54 32 54 C44 54 54 64 56 88 Z" /></svg>
                  {meio && <IconeMais size={28} />}
                </div>
              </div>
            );
          })}
        </div>
        <h2 className="v1-glitch-a v1-pg-vazio-titulo">Nenhum personagem ainda</h2>
        <p className="v1-desliza-a v1-pg-vazio-txt">Crie um personagem aqui e envie para uma campanha quando quiser, ou crie direto dentro de uma das suas campanhas.</p>
        <div className="v1-desliza-a v1-pg-vazio-acao">
          <div className="vb-pulso">
            <button type="button" className="v1-u vb-play" onClick={onCriar}><IconeMais size={16} /> Criar personagem</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Escolha da campanha de destino, no modal da V1: faixa com o retrato e o
 * nome do personagem, a lista de campanhas e o rodapé com a nota e as
 * duas ações.
 */
function DialogoEnviar({ p, destinos, onFechar }: { p: PersonagemLinha | null; destinos: CampanhaDestino[]; onFechar: () => void }) {
  const router = useRouter();
  const { montado } = usePresence(!!p, 180);
  const [ultimo, setUltimo] = useState<PersonagemLinha | null>(p);
  const [destino, setDestino] = useState(destinos[0]?.id ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Guarda o último personagem para o modal continuar desenhado durante a saída.
  useEffect(() => { if (p) { setUltimo(p); setDestino(destinos[0]?.id ?? ""); setErro(null); } }, [p, destinos]);
  const modalRef = useRef<HTMLDivElement>(null);
  // Esc e Tab pela pilha de camadas.
  useCamada({ aberta: !!p, fechar: () => { if (!ocupado) onFechar(); }, raiz: modalRef, modal: true });

  if (!montado || !ultimo) return null;
  const narra = destinos.find((d) => d.id === destino)?.narra ?? false;

  const enviar = async () => {
    if (!destino) { setErro("Escolha uma campanha."); return; }
    setOcupado(true); setErro(null);
    const r = await enviarParaCampanhaAction(ultimo.id, destino);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    onFechar();
    router.refresh();
  };

  // "sai" só quando está fechando (ver a nota no modal de criar campanha).
  const sai = p ? "" : " sai";
  return (
    <>
      <div className={`v1-veu${sai}`} onMouseDown={() => { if (!ocupado) onFechar(); }} aria-hidden="true" />
      <div ref={modalRef} className={`v1-modal v1-modal--enviar${sai}`} role="dialog" aria-modal="true" aria-labelledby="enviar-titulo">
        <div className="v1-modal-capa v1-modal-capa--enviar">
          <Rosto p={ultimo} classe="v1-modal-capa-rosto" />
          <div className="v1-modal-capa-veu" aria-hidden="true" />
          <button type="button" className="v1-u v1-fechar" onClick={onFechar} disabled={ocupado} aria-label="Fechar"><X size={14} /></button>
          <div className="v1-modal-capa-texto">
            <span className="v1-modal-sobrancelha">Enviar para campanha · <span className="v1-campo-opcional">◆ Sem campanha</span></span>
            <h2 id="enviar-titulo" className="v1-modal-nome">{ultimo.name}</h2>
          </div>
        </div>
        <div className="v1-modal-campos">
          {destinos.length === 0 ? (
            <p className="v1-painel-nota">Você ainda não participa de nenhuma campanha. Entre por um convite do narrador para enviar este personagem.</p>
          ) : (
            <div className="v1-campo-grupo">
              <span className="v1-campo-rotulo">Campanha de destino</span>
              <div className="v1-destinos" role="radiogroup" aria-label="Campanha de destino">
                {destinos.map((d) => {
                  const on = d.id === destino;
                  return (
                    <button key={d.id} type="button" role="radio" aria-checked={on} className={`v1-u v1-dest v1-dest--linha${on ? " on" : ""}`}
                      disabled={ocupado} onClick={() => { setDestino(d.id); setErro(null); }}>
                      {d.capa && <span className="v1-dest-arte v1-dest-arte--linha" style={capaDaCampanha(d.capa)} aria-hidden="true" />}
                      <span className="v1-dest-nome">{d.nome}</span>
                      <span className={`v1-dest-papel${d.narra ? " v1-dest-papel--narra" : ""}`}>◆ {d.narra ? "Você narra" : "Jogador"}</span>
                      <span className="v1-dest-marca" aria-hidden="true">{on && <svg className="v1-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4}><path d="M5 12l5 5 9-10" /></svg>}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {erro && <span role="alert" className="v1-campo-erro">{erro}</span>}
          <div className="v1-modal-rodape">
            {destinos.length > 0 && <span className={`v1-modal-nota${narra ? " v1-modal-nota--am" : ""}`}>{narra ? "Você narra: entra direto." : "O narrador precisa aceitar."}</span>}
            <button type="button" className="v1-u v1-ghost v1-btn-cancelar" onClick={onFechar} disabled={ocupado}>Cancelar</button>
            {destinos.length > 0 && (
              <button type="button" className="v1-u v1-criar v1-btn-primario" onClick={() => void enviar()} disabled={ocupado} data-testid="personagem-enviar-confirmar">
                {ocupado ? <><Spinner size={13} className="mo-spin" /> Enviando…</> : <>{narra ? "Adicionar à campanha" : "Enviar pedido"} <Seta /></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
