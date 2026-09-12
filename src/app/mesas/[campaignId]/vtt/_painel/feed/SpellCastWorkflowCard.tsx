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

import { Sparkles, Wand2 } from "lucide-react";
import { CartaoBase } from "../ui/CartaoBase";
import { BotaoTecnico, Chip, Chips, Modulo, Modulos, PainelTecnico } from "../ui/primitivas";
import type { AcentoCartao, CartaoMagia, EstadoMagia } from "./contratos";

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
  return (
    <CartaoBase
      tipo="Magia conjurada"
      nome={cartao.nome}
      icone={<Wand2 />}
      acento="mana"
      autor={cartao.conjurador}
      hora={hora}
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
      acoes={
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
      }
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
  );
}
