"use client";

/**
 * COMBATE, EFEITOS E PENDÊNCIAS — os cards que dão ritmo ao feed.
 *
 *   · `CombatDivider`      — faixa compacta que atravessa o feed
 *                            (`RODADA 03 // TURNOS RÁPIDOS`). Nunca um
 *                            card grande: mudança de turno é ritmo, não
 *                            evento a ser lido em detalhe.
 *   · `TurnResolutionCard` — UM card por resolução (fim de rodada/cena)
 *                            com tabela compacta de ator/efeito/
 *                            resultado/restante, exatamente como a
 *                            referência. É o que agrupa o que seriam
 *                            dez linhas soltas.
 *   · `EffectApplicationCard` — aplicação/remoção/expiração/dano de um
 *                            efeito. Lê `familia` para decidir O QUE
 *                            mostrar: uma CONDIÇÃO abre intensidade,
 *                            dano por rodada e como sair dela; um EFEITO
 *                            TEMPORÁRIO abre só a duração. São perguntas
 *                            diferentes, e o design de origem desenha as
 *                            duas como cards distintos.
 *   · `PendingCheckCard`   — teste pendente, âmbar, com o que falta.
 */

import { useEffect, useRef, useState } from "react";
import { Activity, CircleAlert, CircleDot, Dices, Flame, Heart, ListChecks, ShieldOff, Sparkles } from "lucide-react";
import catalogoCondicoes from "../../../../../../../content/db_condicoes_normalizado_v1_5.json";
import { CartaoBase } from "../ui/CartaoBase";
import { Chip, FaixaResultado, PainelTecnico } from "../ui/primitivas";
import type { CartaoDivisor, CartaoEfeito, CartaoPendencia, CartaoResolucao } from "./contratos";
import { acentoDoCartao } from "./contratos";
import { cabecalhoDe } from "./CabecalhoPersonagem";

function normalizarNome(nome: string): string {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function descricaoDaCondicao(nome: string): string | null {
  const condicao = catalogoCondicoes.condicoes.find((item) => normalizarNome(item.nome) === normalizarNome(nome));
  return condicao?.descricao_longa?.trim() || condicao?.descricao_curta?.trim() || null;
}

function nivelMaximoDaCondicao(nome: string): number | null {
  const condicao = catalogoCondicoes.condicoes.find((item) => normalizarNome(item.nome) === normalizarNome(nome));
  return condicao && "nivel_maximo" in condicao && typeof condicao.nivel_maximo === "number" ? condicao.nivel_maximo : null;
}

function danoPorNivelDaCondicao(nome: string, nivel: number): { dado: string; rotulo: string } | null {
  const condicao = catalogoCondicoes.condicoes.find((item) => normalizarNome(item.nome) === normalizarNome(nome));
  const automacao = condicao?.payload_automacao as { efeitos?: { tipo?: string; dano_por_nivel?: Record<string, string>; falha?: { dano_por_nivel?: Record<string, string> } }[] } | undefined;
  for (const efeito of automacao?.efeitos ?? []) {
    const dado = efeito.dano_por_nivel?.[String(nivel)] ?? efeito.falha?.dano_por_nivel?.[String(nivel)];
    if (dado) return { dado, rotulo: efeito.tipo === "teste_fim_de_rodada" ? "Dano na falha" : "Dano / rodada" };
  }
  return null;
}

function DescricaoExpandivel({ texto, expandido, onAlternar }: { texto: string; expandido: boolean; onAlternar: () => void }) {
  const textoRef = useRef<HTMLParagraphElement>(null);
  const [excede, setExcede] = useState(false);
  useEffect(() => {
    const elemento = textoRef.current;
    if (!elemento) return;
    const medir = () => {
      const estavaExpandido = elemento.dataset.expandido;
      elemento.dataset.expandido = "false";
      setExcede(elemento.scrollHeight > elemento.clientHeight + 1);
      elemento.dataset.expandido = estavaExpandido;
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [texto]);
  return <div className="pn-chat-descricao">
    <p ref={textoRef} className="pn-chat-descricao-texto" data-expandido={expandido ? "true" : "false"}>{texto}</p>
    {excede && <button type="button" className="pn-chat-descricao-expandir" onClick={onAlternar} aria-expanded={expandido}>{expandido ? "Ver menos" : "Ver descrição completa"}</button>}
  </div>;
}

export function CombatDivider({ cartao }: { cartao: CartaoDivisor }) {
  const texto = cartao.texto.replace(/RODADA\s+0*(\d+)\s*\/\/\s*TURNOS\s+/i, "RODADA $1 · ");
  return (
    <div className="pn-divisor" data-acento={cartao.acento} role="separator" aria-label={texto} data-testid="painel-feed-divisor">
      <span className="pn-divisor-txt">{texto}</span>
    </div>
  );
}

export function TurnResolutionCard({
  cartao,
  hora,
  expandido,
  onAlternar,
  visibilidade,
}: {
  cartao: CartaoResolucao;
  hora: string;
  expandido: boolean;
  onAlternar: () => void;
  visibilidade?: React.ReactNode;
}) {
  const temLinhas = cartao.linhas.length > 0;
  return (
    <CartaoBase
      tipo="Resolução"
      nome={cartao.titulo}
      icone={<ListChecks />}
      acento="neutro"
      autor={cartao.titulo}
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      expandido={expandido}
      onAlternarExpandido={temLinhas ? onAlternar : undefined}
      rotuloDetalhes="Efeitos"
      testId="painel-feed-resolucao"
      atributos={{ "data-kind": "resolucao" }}
    >
      {temLinhas ? (
        <PainelTecnico>
          <table className="pn-tabela" data-testid="painel-feed-resolucao-tabela">
            <thead>
              <tr>
                <th scope="col">Ator</th>
                <th scope="col">Efeito</th>
                <th scope="col">Restante</th>
              </tr>
            </thead>
            <tbody>
              {(expandido ? cartao.linhas : cartao.linhas.slice(0, 4)).map((l, i) => (
                <tr key={i} data-encerrado={l.encerrado ? "true" : undefined}>
                  <td>{l.ator}</td>
                  <td>
                    {l.efeito}
                    {l.resultado && <span className="rv-pn-aviso"> · {l.resultado}</span>}
                  </td>
                  <td data-num="true">{l.restante || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!expandido && cartao.linhas.length > 4 && (
            <p className="rv-pn-aviso" style={{ marginTop: 4 }}>
              +{cartao.linhas.length - 4} linha(s)
            </p>
          )}
        </PainelTecnico>
      ) : (
        <p className="pn-texto">Nenhum efeito exigiu resolução.</p>
      )}
    </CartaoBase>
  );
}

function iconeDoEfeito(cartao: CartaoEfeito) {
  if (cartao.acao === "cura") return <Heart />;
  if (cartao.acao === "dano") return <Flame />;
  if (cartao.acao === "removido" || cartao.acao === "expirado") return <ShieldOff />;
  if (cartao.acao === "resistido") return <CircleDot />;
  return <Sparkles />;
}

const ROTULO_ACAO: Record<CartaoEfeito["acao"], string> = {
  aplicado: "Efeito aplicado",
  removido: "Efeito removido",
  expirado: "Efeito expirado",
  resistido: "Efeito resistido",
  dano: "Dano de efeito",
  cura: "Cura",
};

export function EffectApplicationCard({
  cartao,
  hora,
  expandido,
  onAlternar,
  visibilidade,
}: {
  cartao: CartaoEfeito;
  hora: string;
  expandido: boolean;
  onAlternar: () => void;
  visibilidade?: React.ReactNode;
}) {
  const acento = cartao.familia === "condicao" && cartao.acao === "aplicado" ? "perigo" : acentoDoCartao(cartao);
  const ehCondicao = cartao.familia === "condicao";
  const descricao = cartao.descricao?.trim() || (ehCondicao ? descricaoDaCondicao(cartao.nome) : null);
  const nivelMaximo = cartao.intensidadeMaxima ?? (ehCondicao ? nivelMaximoDaCondicao(cartao.nome) : null);
  const nivel = cartao.intensidade;
  const danoDoNivel = ehCondicao && nivel != null ? danoPorNivelDaCondicao(cartao.nome, nivel) : null;
  const danoDireto = cartao.danoPorRodada?.match(/^\d+d\d+$/i)?.[0] ?? null;
  const dadoDestacado = danoDoNivel?.dado ?? danoDireto;
  const metadados = [!dadoDestacado && cartao.danoPorRodada ? `${cartao.danoPorRodada} no fim da rodada` : null, cartao.duracao].filter(Boolean).join(" · ");
  return (
    <CartaoBase
      tipo={ROTULO_ACAO[cartao.acao]}
      nome={cartao.nome}
      icone={cartao.familia === "condicao" ? <Activity /> : iconeDoEfeito(cartao)}
      acento={acento}
      autor={`${cartao.alvo ?? cartao.autoria.nome} · ${cartao.familia === "condicao" ? "condição" : "efeito"} ${cartao.acao}${cartao.fonte ? ` · ${cartao.fonte}` : ""}`}
      hora={hora}
      cabecalho={!cartao.alvo || cartao.alvo === cartao.autoria.nome ? cabecalhoDe(cartao.autoria, hora, cartao.criadoEm) : undefined}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      testId="painel-feed-efeito"
      atributos={{ "data-kind": "efeito", "data-acao": cartao.acao, "data-familia": cartao.familia }}
    >
      {ehCondicao && (nivel != null || dadoDestacado) && <div className="pn-chat-condicao-indicadores">
        {nivel != null && <span className="pn-chat-nivel" aria-label={nivelMaximo != null ? `Nível ${nivel} de ${nivelMaximo}` : `Nível ${nivel}`}>
          <span className="pn-chat-nivel-valor">NÍVEL <b>{nivel}{nivelMaximo != null ? `/${nivelMaximo}` : ""}</b></span>
          {nivelMaximo != null && nivelMaximo > 0 && nivelMaximo <= 8 && <span className="pn-chat-nivel-passos" aria-hidden="true">{Array.from({ length: nivelMaximo }, (_, i) => <span key={i} data-ativo={i < nivel ? "true" : undefined} />)}</span>}
        </span>}
        {dadoDestacado && <span className="pn-chat-condicao-dano" aria-label={`${danoDoNivel?.rotulo ?? "Dano por rodada"}: ${dadoDestacado}`}><Dices size={13} aria-hidden="true" /><span>{danoDoNivel?.rotulo ?? "Dano / rodada"}</span><b>{dadoDestacado}</b></span>}
      </div>}
      {metadados && <p className="pn-chat-meta-linha">{metadados}</p>}
      {descricao && <DescricaoExpandivel texto={descricao} expandido={expandido} onAlternar={onAlternar} />}
      {cartao.cura && <p className="pn-texto"><strong>Como sair:</strong> {cartao.cura}</p>}
      {cartao.delta && (
        <FaixaResultado
          rotulo={cartao.delta.rotulo}
          valor={cartao.delta.valor}
          acento={cartao.delta.acento}
          icone={cartao.delta.acento === "ok" ? <Heart /> : <Flame />}
          testId="painel-feed-efeito-delta"
        />
      )}
    </CartaoBase>
  );
}

export function PendingCheckCard({
  cartao,
  hora,
  visibilidade,
  onRolar,
}: {
  cartao: CartaoPendencia;
  hora: string;
  visibilidade?: React.ReactNode;
  onRolar?: () => void;
}) {
  return (
    <CartaoBase
      tipo="Pendência"
      nome={cartao.titulo}
      icone={<CircleAlert />}
      acento={cartao.resolvida ? "ok" : "am"}
      autor={`${cartao.alvo ?? cartao.autoria.nome} · ${cartao.resolvida ? cartao.titulo : "pendente"}`}
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      estado={
        <Chip acento={cartao.resolvida ? "ok" : "am"} testId="painel-feed-pendencia-estado">
          {cartao.resolvida ? "Resolvida" : "Aguardando resolução"}
        </Chip>
      }
      testId="painel-feed-pendencia"
      atributos={{ "data-kind": "pendencia" }}
    >
      {!cartao.resolvida && <p className="pn-texto">{cartao.descricao}</p>}
      {!cartao.resolvida && onRolar && <button type="button" className="pn-chat-rolar" onClick={onRolar}>Rolar</button>}
      {cartao.resolvida && <p className="pn-chat-meta-linha pn-chat-pendencia-resolvida">resolvida{cartao.resultado ? ` · ${cartao.resultado}` : ""}</p>}
    </CartaoBase>
  );
}
