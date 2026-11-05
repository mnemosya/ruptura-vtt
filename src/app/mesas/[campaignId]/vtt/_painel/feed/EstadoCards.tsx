"use client";

/**
 * ESTADOS DO PERSONAGEM — colapso, sobrecarga, descanso e Ruptura.
 *
 * Os quatro saíam antes pelo card genérico de efeito, e o resultado era
 * o mesmo desenho para coisas que a mesa lê de maneira muito diferente:
 * um colapso é uma queda em curso, um descanso é recuperação, uma
 * Ruptura é preço cobrado. Pior, o card genérico não lia os campos
 * deles — descanso chegava a sair com o nome "Efeito" e nenhum número.
 *
 * Cada card aqui mostra o que a sua mecânica cobra:
 *
 *   · `CollapseCard`   — em que segmento a queda está, e o que a parou.
 *   · `OverloadCard`   — qual surto, o quanto custou, e se abriu Ruptura.
 *   · `RestCard`       — `antes → depois` de cada recurso que voltou.
 *   · `RuptureCard`    — nível, Integridade paga e Mana devolvida.
 *
 * A casca compartilhada vem de `CartaoBase`; os valores usam as linhas
 * e segmentos do board "Chat Log".
 */

import { Atom, HeartCrack, Moon, ShieldCheck, Siren, Zap } from "lucide-react";
import { CartaoBase } from "../ui/CartaoBase";
import { Chip, FaixaResultado } from "../ui/primitivas";
import { acentoDoCartao, type CartaoColapso, type CartaoDescanso, type CartaoRuptura, type CartaoSobrecarga, type FaseColapso } from "./contratos";
import { cabecalhoDe } from "./CabecalhoPersonagem";

/* ── colapso ─────────────────────────────────────────────────────── */

const ROTULO_FASE: Record<FaseColapso, string> = {
  iniciado: "Colapso iniciado",
  avancado: "Colapso avançando",
  estabilizado: "Colapso estabilizado",
  encerrado: "Colapso encerrado",
  desfecho: "Desfecho do colapso",
};

const ESTADO_FASE: Record<FaseColapso, string> = {
  iniciado: "Em queda",
  avancado: "Em queda",
  estabilizado: "Estabilizado",
  encerrado: "Encerrado",
  desfecho: "Desfecho",
};

export function CollapseCard({
  cartao,
  hora,
  expandido,
  onAlternar,
  visibilidade,
}: {
  cartao: CartaoColapso;
  hora: string;
  expandido: boolean;
  onAlternar: () => void;
  visibilidade?: React.ReactNode;
}) {
  const acento = acentoDoCartao(cartao);
  const parou = cartao.fase === "estabilizado" || cartao.fase === "encerrado";
  const temMotivo = !!cartao.motivo;
  const segmento = cartao.segmento;
  return (
    <CartaoBase
      tipo={ROTULO_FASE[cartao.fase]}
      nome={ESTADO_FASE[cartao.fase]}
      icone={parou ? <ShieldCheck /> : <HeartCrack />}
      acento={acento}
      autor={`${cartao.alvo ?? cartao.autoria.nome} · colapso${cartao.recurso ? ` de ${cartao.recurso}` : ""}`}
      hora={hora}
      cabecalho={cabecalhoDe(cartao.autoria, hora, cartao.criadoEm)}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      estado={<Chip acento={acento}>{ESTADO_FASE[cartao.fase]}</Chip>}
      expandido={expandido}
      onAlternarExpandido={temMotivo ? onAlternar : undefined}
      rotuloDetalhes="Motivo"
      detalhes={temMotivo ? <p className="pn-texto">{cartao.motivo}</p> : undefined}
      testId="painel-feed-colapso"
      atributos={{ "data-kind": "colapso", "data-fase": cartao.fase }}
    >
      {segmento != null && (
        <div className="pn-chat-segmentos" data-testid="painel-feed-colapso-segmento">
          <div className="pn-chat-segmentos-barra" aria-hidden="true">{Array.from({ length: cartao.segmentoMax }, (_, i) => <span key={i} data-cheio={i < segmento ? "true" : undefined} />)}</div>
          <span>segmento {segmento} de {cartao.segmentoMax}</span>
        </div>
      )}
      {cartao.desfecho && (
        <FaixaResultado
          rotulo={cartao.desfecho}
          acento={acento}
          icone={parou ? <ShieldCheck /> : <HeartCrack />}
          testId="painel-feed-colapso-desfecho"
        />
      )}
    </CartaoBase>
  );
}

/* ── sobrecarga ──────────────────────────────────────────────────── */

export function OverloadCard({
  cartao,
  hora,
  visibilidade,
}: {
  cartao: CartaoSobrecarga;
  hora: string;
  visibilidade?: React.ReactNode;
}) {
  const acento = "am";
  return (
    <CartaoBase
      tipo="Surto de sobrecarga"
      nome={cartao.efeito ?? "Surto"}
      icone={<Zap />}
      acento={acento}
      autor={`${cartao.alvo ?? cartao.autoria.nome}${cartao.indice != null ? ` · surto ${cartao.indice} de ${cartao.maximo}` : " · surto"}`}
      hora={hora}
      cabecalho={cabecalhoDe(cartao.autoria, hora, cartao.criadoEm)}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      estado={
        cartao.rupturaPendente ? (
          <Chip acento="perigo" icone={<Siren />} testId="painel-feed-sobrecarga-ruptura">
            Ruptura pendente
          </Chip>
        ) : undefined
      }
      testId="painel-feed-sobrecarga"
      atributos={{ "data-kind": "sobrecarga" }}
    >
      {cartao.danoPsiquico != null && <p className="pn-texto" data-testid="painel-feed-sobrecarga-dano">{cartao.danoDado ? `${cartao.danoDado} · ` : ""}{cartao.danoPsiquico} de dano psíquico</p>}
      {/* O dano já foi aplicado em PE — mesma faixa do "Dano aplicado" do
          card de ataque. Logs antigos (sem PE) não têm a faixa. */}
      {cartao.peAntes != null && cartao.peDepois != null && (
        <div className="pn-chat-variacao" data-testid="painel-feed-sobrecarga-pe"><span className="pn-chat-variacao-rotulo">PE</span><span className="pn-chat-variacao-valor"><span>{cartao.peAntes} →</span> {cartao.peDepois} <em data-acento="perigo">{cartao.peDepois - cartao.peAntes}</em></span></div>
      )}
    </CartaoBase>
  );
}

/* ── descanso ────────────────────────────────────────────────────── */

export function RestCard({
  cartao,
  hora,
  visibilidade,
}: {
  cartao: CartaoDescanso;
  hora: string;
  visibilidade?: React.ReactNode;
}) {
  const temRecursos = cartao.recursos.length > 0;
  return (
    <CartaoBase
      tipo={cartao.duracao === "longo" ? "Descanso longo" : "Descanso curto"}
      nome="Recuperação"
      icone={<Moon />}
      acento="ok"
      autor={`${cartao.alvo ?? cartao.autoria.nome} · descanso ${cartao.duracao}`}
      hora={hora}
      cabecalho={cabecalhoDe(cartao.autoria, hora, cartao.criadoEm)}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      testId="painel-feed-descanso"
      atributos={{ "data-kind": "descanso", "data-duracao": cartao.duracao }}
    >
      {temRecursos ? (
        <div className="pn-chat-variacoes">
          {cartao.recursos.map((r) => (
            <div className="pn-chat-variacao" key={r.rotulo} data-testid={`painel-feed-descanso-${r.rotulo.toLowerCase()}`}>
              <span className="pn-chat-variacao-rotulo">{r.rotulo}</span>
              <span className="pn-chat-variacao-valor"><span>{r.antes} →</span> {r.depois} <em data-acento={r.delta > 0 ? "ok" : "neutro"}>{r.delta > 0 ? `+${r.delta}` : String(r.delta)}</em></span>
            </div>
          ))}
        </div>
      ) : (
        <p className="pn-texto">Sem mudança de recursos.</p>
      )}
    </CartaoBase>
  );
}

/* ── ruptura ─────────────────────────────────────────────────────── */

export function RuptureCard({
  cartao,
  hora,
  visibilidade,
}: {
  cartao: CartaoRuptura;
  hora: string;
  visibilidade?: React.ReactNode;
}) {
  const perda =
    cartao.integridadeAntes != null && cartao.integridadeDepois != null
      ? cartao.integridadeDepois - cartao.integridadeAntes
      : null;
  return (
    <CartaoBase
      tipo="Ruptura resolvida"
      nome={cartao.nivel != null ? `Ruptura nível ${cartao.nivel}` : "Ruptura"}
      icone={<Atom />}
      acento="magenta"
      autor={`${cartao.alvo ?? cartao.autoria.nome}${cartao.nivel != null ? ` · ruptura nível ${cartao.nivel}` : " · ruptura"}`}
      hora={hora}
      cabecalho={cabecalhoDe(cartao.autoria, hora, cartao.criadoEm)}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      testId="painel-feed-ruptura"
      atributos={{ "data-kind": "ruptura" }}
    >
      <div className="pn-chat-variacoes">
        {cartao.integridadeAntes != null && cartao.integridadeDepois != null && (
          <div className="pn-chat-variacao" data-testid="painel-feed-ruptura-integridade">
            <span className="pn-chat-variacao-rotulo">Integridade</span>
            <span className="pn-chat-variacao-valor"><span>{cartao.integridadeAntes} →</span> {cartao.integridadeDepois} {perda != null && perda !== 0 && <em data-acento="perigo">{perda}</em>}</span>
          </div>
        )}
        {cartao.bonusMana != null && (
          <div className="pn-chat-variacao"><span className="pn-chat-variacao-rotulo">Mana máxima</span><span className="pn-chat-variacao-valor"><em data-acento="mana">+{cartao.bonusMana}</em></span></div>
        )}
      </div>
      {/* Sem faixa de fecho: ela repetiria o `+N` que o módulo de Mana
          já mostra, e o card sairia com o mesmo número três vezes. */}
    </CartaoBase>
  );
}
