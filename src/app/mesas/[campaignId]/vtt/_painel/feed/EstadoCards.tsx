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
 * Anatomia e CSS são os compartilhados (`CartaoBase` + `primitivas`):
 * o que distingue um card do outro continua sendo espinha, acento e
 * rótulo, nunca um fundo colorido próprio.
 */

import { BedDouble, HeartCrack, ShieldCheck, Siren, TrendingDown, Zap } from "lucide-react";
import { CartaoBase } from "../ui/CartaoBase";
import { Chip, Chips, FaixaResultado, Modulo, Modulos } from "../ui/primitivas";
import { acentoDoCartao, type CartaoColapso, type CartaoDescanso, type CartaoRuptura, type CartaoSobrecarga, type FaseColapso } from "./contratos";

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
  estabilizado: "Estável",
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
  return (
    <CartaoBase
      tipo={ROTULO_FASE[cartao.fase]}
      nome={cartao.recurso ? `Colapso de ${cartao.recurso}` : "Colapso"}
      icone={parou ? <ShieldCheck /> : <TrendingDown />}
      acento={acento}
      autor={cartao.alvo ?? cartao.autoria.nome}
      hora={hora}
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
      {cartao.segmento != null && (
        <Modulos colunas={2}>
          <Modulo
            rotulo="Segmento"
            valor={cartao.segmento}
            sub={`/${cartao.segmentoMax}`}
            acento={acento}
            testId="painel-feed-colapso-segmento"
          />
          {cartao.recurso && <Modulo rotulo="Trilha" valor={cartao.recurso} acento={acento} />}
        </Modulos>
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
  const acento = acentoDoCartao(cartao);
  return (
    <CartaoBase
      tipo="Surto de sobrecarga"
      nome={cartao.efeito ?? "Surto"}
      icone={<Zap />}
      acento={acento}
      autor={cartao.alvo ?? cartao.autoria.nome}
      hora={hora}
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
      <Modulos colunas={2}>
        {cartao.indice != null && (
          <Modulo rotulo="Surto" valor={cartao.indice} sub={`/${cartao.maximo}`} acento="mana" />
        )}
        {cartao.danoPsiquico != null && (
          <Modulo
            rotulo="Dano psíquico"
            valor={cartao.danoPsiquico}
            sub={cartao.danoDado ?? undefined}
            acento="perigo"
            destaque
            testId="painel-feed-sobrecarga-dano"
          />
        )}
      </Modulos>
      {/* A regra manda aplicar o dano à mão — o card diz isso em vez de
          fingir que já aconteceu. */}
      <p className="pn-texto">Aplicação manual do dano.</p>
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
      icone={<BedDouble />}
      acento="ok"
      autor={cartao.alvo ?? cartao.autoria.nome}
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      testId="painel-feed-descanso"
      atributos={{ "data-kind": "descanso", "data-duracao": cartao.duracao }}
    >
      {temRecursos ? (
        <Modulos colunas={cartao.recursos.length >= 3 ? 3 : 2}>
          {cartao.recursos.map((r) => (
            <Modulo
              key={r.rotulo}
              rotulo={r.rotulo}
              valor={`${r.antes} → ${r.depois}`}
              sub={r.delta > 0 ? `+${r.delta}` : String(r.delta)}
              acento={r.delta > 0 ? "ok" : "neutro"}
              testId={`painel-feed-descanso-${r.rotulo.toLowerCase()}`}
            />
          ))}
        </Modulos>
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
      icone={<HeartCrack />}
      acento="perigo"
      autor={cartao.alvo ?? cartao.autoria.nome}
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      testId="painel-feed-ruptura"
      atributos={{ "data-kind": "ruptura" }}
    >
      <Modulos colunas={2}>
        {cartao.integridadeAntes != null && cartao.integridadeDepois != null && (
          <Modulo
            rotulo="Integridade"
            valor={`${cartao.integridadeAntes} → ${cartao.integridadeDepois}`}
            sub={perda != null && perda !== 0 ? String(perda) : undefined}
            acento="perigo"
            testId="painel-feed-ruptura-integridade"
          />
        )}
        {cartao.bonusMana != null && (
          <Modulo rotulo="Mana máxima" valor={`+${cartao.bonusMana}`} acento="mana" />
        )}
      </Modulos>
      {/* Sem faixa de fecho: ela repetiria o `+N` que o módulo de Mana
          já mostra, e o card sairia com o mesmo número três vezes. */}
    </CartaoBase>
  );
}
