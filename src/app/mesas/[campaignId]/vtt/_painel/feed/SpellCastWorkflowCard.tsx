"use client";

/**
 * MAGIA — conjuração como WORKFLOW.
 *
 * A regra que este card materializa: **conjurar não rola ataque nem
 * dano**. Ao conjurar, os custos são pagos e o card nasce; a partir
 * dele o fluxo oferece as etapas seguintes:
 *
 *   CONJURADA → AGUARDANDO ATAQUE → ATAQUE ROLADO → DEFESA RESOLVIDA
 *   → AGUARDANDO DANO → AGUARDANDO APLICAÇÃO → RESOLVIDA
 *
 * PA e Mana consumidos aparecem em módulos pequenos, na mesma
 * linguagem das barras de recurso do Console.
 *
 * Quando o conteúdo efetivo não tem estrutura suficiente para conduzir
 * a resolução (sem fórmula de dano, sem resistência declarada), o card
 * assume o estado `manual` e diz "RESOLUÇÃO MANUAL" com os dados REAIS
 * que existem. Nada é inventado — nem fórmula, nem CD, nem alvo.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Sparkles, Wand2 } from "lucide-react";
import { Faixa, Leitura, Titulo, type MagiaHud } from "../../../../../ficha/_console/panels/hud/MagiasHud";
import { TextoComRegras } from "../../../../../ficha/_console/TextoComRegras";
import { oxanium } from "../../../../../_design/oxanium";
import { CartaoBase } from "../ui/CartaoBase";
import { BotaoTecnico, Chip, Chips, Modulo, Modulos, PainelTecnico } from "../ui/primitivas";
import type { AcentoCartao, CartaoMagia, EstadoMagia } from "./contratos";
import { cabecalhoDe } from "./CabecalhoPersonagem";

const ROTULO_ESTADO: Record<EstadoMagia, string> = {
  conjurada: "Conjurada",
  aguardando_ataque: "Aguardando ataque",
  ataque_rolado: "Ataque rolado",
  defesa_resolvida: "Defesa resolvida",
  aguardando_dano: "Aguardando dano",
  aguardando_aplicacao: "Aguardando aplicação",
  resolvida: "Resolvida",
  manual: "Resolução manual",
};

const ACENTO_ESTADO: Record<EstadoMagia, AcentoCartao> = {
  conjurada: "mana",
  aguardando_ataque: "am",
  ataque_rolado: "am",
  defesa_resolvida: "am",
  aguardando_dano: "am",
  aguardando_aplicacao: "am",
  resolvida: "ok",
  manual: "neutro",
};

export function SpellCastWorkflowCard({
  cartao,
  hora,
  expandido,
  onAlternar,
  visibilidade,
}: {
  cartao: CartaoMagia;
  hora: string;
  expandido: boolean;
  onAlternar: () => void;
  visibilidade?: React.ReactNode;
}) {
  const temDescricao = !!cartao.descricao;
  const [vendo, setVendo] = useState(false);
  const podeVer = !!(cartao.descricao || cartao.snapshot.efeito);
  const verMagia = podeVer ? (
    <BotaoTecnico acento="mana" icone={<BookOpen />} onClick={() => setVendo(true)} testId="painel-feed-magia-ver">Ver magia</BotaoTecnico>
  ) : null;
  return (<>
    {vendo && <VerMagia cartao={cartao} onFechar={() => setVendo(false)} />}
    <CartaoBase
      tipo="Magia conjurada"
      nome={cartao.nome}
      icone={<Wand2 />}
      acento="mana"
      autor={cartao.conjurador}
      hora={hora}
      cabecalho={cabecalhoDe(cartao.autoria, hora, cartao.criadoEm)}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      estado={
        <>
          <Chip acento={ACENTO_ESTADO[cartao.estado]} testId="painel-feed-magia-estado">
            {ROTULO_ESTADO[cartao.estado]}
          </Chip>
          {cartao.vertente && <Chip acento="mana">{cartao.vertente}</Chip>}
          {cartao.nivel != null && <Chip acento="mana">Nível {cartao.nivel}</Chip>}
        </>
      }
      expandido={expandido}
      onAlternarExpandido={temDescricao ? onAlternar : undefined}
      rotuloDetalhes="Descrição"
      detalhes={temDescricao ? <PainelTecnico><p className="pn-texto">{cartao.descricao}</p></PainelTecnico> : undefined}
      acoes={<>{
        cartao.estado === "manual" ? (
          <BotaoTecnico
            primario
            acento="neutro"
            desabilitado
            titulo={cartao.motivoManual ?? "O conteúdo efetivo não descreve resolução automática desta magia."}
            testId="painel-feed-magia-manual"
          >
            Resolução manual
          </BotaoTecnico>
        ) : cartao.exigeAtaque ? (
          <BotaoTecnico
            primario
            acento="am"
            desabilitado
            titulo="A rolagem de ataque sai do Console/HUD do conjurador; o resultado volta como card de ataque."
            icone={<Sparkles />}
            testId="painel-feed-magia-aguardando"
          >
            Aguardando ataque
          </BotaoTecnico>
        ) : undefined
      }{verMagia}</>}
      testId="painel-feed-magia"
      atributos={{ "data-kind": "magia", "data-workflow": cartao.workflowId, "data-estado": cartao.estado }}
    >
      {cartao.tags.length > 0 && (
        <Chips>
          {cartao.tags.slice(0, 6).map((t) => (
            <Chip key={t} acento="mana">{t}</Chip>
          ))}
        </Chips>
      )}

      {cartao.custos.length > 0 && (
        <Modulos colunas={2}>
          {cartao.custos.map((c, i) => (
            <Modulo key={i} rotulo={c.rotulo} valor={c.valor} acento={c.acento ?? "mana"} />
          ))}
        </Modulos>
      )}

      {cartao.estatisticas.length > 0 && (
        <Modulos colunas={cartao.estatisticas.length >= 3 ? 3 : 2}>
          {cartao.estatisticas.slice(0, 6).map((e, i) => (
            <Modulo key={i} rotulo={e.rotulo} valor={e.valor} acento="mana" />
          ))}
        </Modulos>
      )}

      {cartao.estado === "manual" && cartao.motivoManual && (
        <p className="pn-texto">{cartao.motivoManual}</p>
      )}
    </CartaoBase>
  </>);
}

/**
 * "Ver magia": o mesmo modal da aba Magias do Console, montado a partir do
 * snapshot gravado na conjuração (não relê o catálogo). Só leitura.
 */
function VerMagia({ cartao, onFechar }: { cartao: CartaoMagia; onFechar: () => void }) {
  const s = cartao.snapshot;
  const m: MagiaHud = {
    slug: s.slug ?? cartao.workflowId, nome: cartao.nome, vertente: s.vertenteId ?? "cinetica", nivel: cartao.nivel ?? 1,
    tipo: s.tipo ?? "", mana: s.mana, pa: s.pa, alcance: s.alcance, area: s.area, duracao: s.duracao,
    preRequisito: s.preRequisito, conjuracao: s.conjuracao,
    descricao: cartao.descricao ? <TextoComRegras texto={cartao.descricao} glossario={[]} /> : null,
    efeito: s.efeito ? <TextoComRegras texto={s.efeito} glossario={[]} /> : null,
    bloqueada: false,
  };
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`hx ${oxanium.variable}`} onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onFechar(); }}
      style={{ position: "fixed", inset: 0, zIndex: 900, display: "grid", placeItems: "center", background: "rgba(6,18,28,.75)", backdropFilter: "blur(2px)" }}>
      <div className="hx-edge hx-ch hx-pop" role="dialog" aria-label={cartao.nome} style={{ width: 420, maxWidth: "calc(100% - 32px)", boxShadow: "0 30px 80px -20px #000" }}>
        <div className="hx-ch" style={{ position: "relative", display: "flex", flexDirection: "column", maxHeight: "min(660px, calc(100vh - 80px))", background: "#081925" }}>
          <button type="button" onClick={onFechar} aria-label="Fechar" autoFocus className="hx-ch-hex hx-fechar" style={{ position: "absolute", right: 12, top: 12, zIndex: 3 }}>
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <div className="hx-semsb" style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
            <Faixa m={m} nivel={null} semPersonagem />
            <Titulo m={m} />
            <div style={{ padding: 16 }}><Leitura m={m} mana={{ atual: Number.MAX_SAFE_INTEGER, max: 0 }} /></div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
