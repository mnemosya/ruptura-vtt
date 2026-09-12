"use client";

/**
 * REFERÊNCIA DE CONTEÚDO — magia, condição, efeito, item, arma,
 * talento e o resto do Compêndio compartilhado no Chat.
 *
 * Anatomia da referência anexada: ícone técnico, nome forte, linha de
 * chips (tags), estatísticas principais numa grade compacta e a
 * descrição num módulo interno RECOLHÍVEL.
 *
 * Tudo vem do SNAPSHOT gravado no evento — nunca de uma releitura do
 * Compêndio em tempo de render. É o que garante que editar o documento
 * hoje não reescreva o que o Chat mostrou ontem.
 *
 * `EffectReferenceCard` é este mesmo componente com acento âmbar e
 * rótulo de efeito: a anatomia é idêntica, e duplicá-la só produziria
 * duas coisas para consertar.
 */

import { BookOpen, Package, Sparkles, Wand2 } from "lucide-react";
import { CartaoBase } from "../ui/CartaoBase";
import { Chip, Chips, Modulo, Modulos, PainelTecnico } from "../ui/primitivas";
import type { AcentoCartao, CartaoReferencia, CartaoUso, SnapshotConteudo } from "./contratos";

function iconeDaCategoria(categoria: string) {
  if (categoria === "magias") return <Wand2 />;
  if (categoria === "itens" || categoria === "runas") return <Package />;
  if (categoria === "condicoes") return <Sparkles />;
  return <BookOpen />;
}

function acentoDaCategoria(categoria: string): AcentoCartao {
  if (categoria === "magias") return "mana";
  if (categoria === "condicoes") return "am";
  return "cy";
}

export function ContentReferenceCard({
  cartao,
  hora,
  expandido,
  onAlternar,
  visibilidade,
}: {
  cartao: CartaoReferencia;
  hora: string;
  expandido: boolean;
  onAlternar: () => void;
  visibilidade?: React.ReactNode;
}) {
  const c: SnapshotConteudo = cartao.conteudo;
  const acento = acentoDaCategoria(c.categoria);
  const temDescricao = !!c.descricao;

  return (
    <CartaoBase
      tipo={c.categoriaRotulo || "Compêndio"}
      nome={c.nome}
      icone={iconeDaCategoria(c.categoria)}
      acento={acento}
      autor={cartao.autoria.nome}
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      expandido={expandido}
      onAlternarExpandido={temDescricao ? onAlternar : undefined}
      rotuloDetalhes="Descrição"
      detalhes={temDescricao ? <PainelTecnico><p className="pn-texto">{c.descricao}</p></PainelTecnico> : undefined}
      testId="painel-feed-referencia"
      atributos={{ "data-kind": "referencia", "data-slug": c.slug }}
    >
      {(c.tags.length > 0 || c.origem !== "oficial") && (
        <Chips>
          {c.origem !== "oficial" && (
            <Chip acento="am" titulo={c.origemRotulo}>
              {c.origem === "homebrew" ? "Homebrew" : "Modificado"}
            </Chip>
          )}
          {c.tags.slice(0, 6).map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </Chips>
      )}

      {c.estatisticas.length > 0 && (
        <Modulos colunas={c.estatisticas.length >= 3 ? 3 : 2}>
          {c.estatisticas.slice(0, 6).map((e, i) => (
            <Modulo key={i} rotulo={e.rotulo} valor={e.valor} acento={acento} />
          ))}
        </Modulos>
      )}

      {!temDescricao && c.resumo && <p className="pn-texto">{c.resumo}</p>}
    </CartaoBase>
  );
}

/**
 * USO de item/talento — a mesma anatomia, mais a linha de custos
 * (`PA`, `Cargas`, `Usos`) que veio DENTRO do evento de uso. É por isso
 * que `action_used`/`ammunition` não precisam de card próprio.
 *
 * O que muda entre os dois não é a moldura, é o DADO: um ITEM responde
 * "quanto sobrou", um TALENTO responde "o que dispara e quando volta".
 * Cada lado mostra só o seu — é a separação que o design de origem faz
 * entre `ItemCard` e `TalentCard`.
 */
export function ContentUseCard({
  cartao,
  hora,
  expandido,
  onAlternar,
  visibilidade,
}: {
  cartao: CartaoUso;
  hora: string;
  expandido: boolean;
  onAlternar: () => void;
  visibilidade?: React.ReactNode;
}) {
  const acento: AcentoCartao = cartao.tipoUso === "talento" ? "mana" : "cy";
  const temDescricao = !!cartao.descricao;
  return (
    <CartaoBase
      tipo={cartao.tipoUso === "talento" ? "Talento usado" : "Item usado"}
      nome={cartao.nome}
      icone={cartao.tipoUso === "talento" ? <Sparkles /> : <Package />}
      acento={acento}
      autor={cartao.autoria.nome}
      hora={hora}
      horaISO={cartao.criadoEm}
      visibilidade={visibilidade}
      expandido={expandido}
      onAlternarExpandido={temDescricao ? onAlternar : undefined}
      rotuloDetalhes="Descrição"
      detalhes={temDescricao ? <PainelTecnico><p className="pn-texto">{cartao.descricao}</p></PainelTecnico> : undefined}
      testId="painel-feed-uso"
      atributos={{ "data-kind": "uso" }}
    >
      {(cartao.tags.length > 0 || cartao.gatilho || cartao.recarga || cartao.restante) && (
        <Chips>
          {cartao.tipoUso === "talento" && cartao.gatilho && (
            <Chip acento="mana" titulo="O que dispara o talento">Gatilho: {cartao.gatilho}</Chip>
          )}
          {cartao.tipoUso === "talento" && cartao.recarga && (
            <Chip acento="am" titulo="Quando volta a ficar disponível">Recarga: {cartao.recarga}</Chip>
          )}
          {cartao.tipoUso === "item" && cartao.restante && (
            <Chip acento="cy" titulo="O que sobrou depois do uso">Restam {cartao.restante}</Chip>
          )}
          {cartao.tags.slice(0, 5).map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </Chips>
      )}
      {cartao.custos.length > 0 && (
        <Modulos colunas={cartao.custos.length >= 3 ? 3 : 2}>
          {cartao.custos.map((m, i) => (
            <Modulo key={i} rotulo={m.rotulo} valor={m.valor} acento={m.acento ?? acento} />
          ))}
        </Modulos>
      )}
      {cartao.efeito && <p className="pn-texto">{cartao.efeito}</p>}
    </CartaoBase>
  );
}
