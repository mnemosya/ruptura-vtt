"use client";

/**
 * A aba INVENTÁRIO do Console — a estrutura do desenho (Figma
 * `159:40519`), na paleta e na tipografia que o Console já tem.
 *
 * DUAS COLUNAS, e a divisão não é estética: a esquerda responde "o que
 * eu tenho" (uma grade que se varre de relance, com quantidade e
 * categoria), a direita responde "o que é isto" (a ficha do item
 * escolhido, com números, propriedades e efeito). Sem a segunda, cada
 * item viraria um clique pra outro lugar; sem a primeira, escolher
 * seria ler uma lista de nomes.
 *
 * DADOS POR PROP, sempre. Este painel não busca nada: recebe os itens
 * já projetados e devolve as intenções (`onUsar`, `onMover`). É o que
 * permite a galeria de estilos montá-lo com fixture e o Console montar
 * com o inventário de verdade sem duas versões do desenho.
 */

import { useMemo, useState } from "react";
import {
  Bomb, Filter, Minus, Package, Pill, Plus, Search, Shield, Sparkles, Swords, Wrench,
  type LucideIcon,
} from "lucide-react";

/** Onde o item está. "Equipado" reúne equipado, empunhado e acesso rápido — o mesmo conjunto que a aba Equipamentos mostra. */
export type LocalDoItem = "mochila" | "equipado" | "abrigo";

export interface ItemDoInventario {
  id: string;
  nome: string;
  /** Rótulo curto da categoria — é o que aparece sob o nome no cartão. */
  categoria: string;
  /** Família visual: decide ícone e cor do ladrilho. */
  familia: "explosivo" | "arma" | "vertina" | "escudo" | "farmacia" | "utilitario";
  local: LocalDoItem;
  quantidade: number;
  /** Espaços que UMA unidade ocupa. */
  espacos: number;
  raridade?: string;
  descricao?: string;
  /** PA para usar. `null` quando o item não se usa por ação. */
  custoPa?: number | null;
  precoBase?: number | null;
  /** Propriedades em linha: alcance, alvo, duração… na ordem que vierem. */
  propriedades?: { rotulo: string; valor: string }[];
  /**
   * Efeito em pedaços, pra que termo de regra vire chip sem o painel
   * ter que interpretar texto: `{ termo: "Atordoados" }` desenha o
   * chip, string crua desenha texto.
   */
  efeito?: (string | { termo: string; tom?: "regra" | "condicao" })[];
}

const ICONE: Record<ItemDoInventario["familia"], LucideIcon> = {
  explosivo: Bomb,
  arma: Swords,
  vertina: Sparkles,
  escudo: Shield,
  farmacia: Pill,
  utilitario: Wrench,
};

const ABAS: { id: LocalDoItem | "todos"; rotulo: string }[] = [
  { id: "mochila", rotulo: "Mochila" },
  { id: "equipado", rotulo: "Equipado" },
  { id: "abrigo", rotulo: "Abrigo" },
  { id: "todos", rotulo: "Todos" },
];

export function InventarioPanel({
  itens,
  capacidadeTotal,
  onUsar,
  onMover,
}: {
  itens: ItemDoInventario[];
  /** Espaços que a mochila comporta — o denominador da barra. */
  capacidadeTotal: number;
  onUsar?: (item: ItemDoInventario, quantidade: number) => void;
  onMover?: (item: ItemDoInventario, quantidade: number) => void;
}) {
  const [aba, setAba] = useState<LocalDoItem | "todos">("mochila");
  const [busca, setBusca] = useState("");
  const [selecionadoId, setSelecionadoId] = useState<string | null>(itens[0]?.id ?? null);
  const [quantidade, setQuantidade] = useState(1);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return itens.filter((i) =>
      (aba === "todos" || i.local === aba)
      && (!termo || i.nome.toLocaleLowerCase("pt-BR").includes(termo) || i.categoria.toLocaleLowerCase("pt-BR").includes(termo)));
  }, [itens, aba, busca]);

  const selecionado = itens.find((i) => i.id === selecionadoId) ?? visiveis[0] ?? null;

  /* A CAPACIDADE é da MOCHILA, não da aba aberta: trocar pra "Equipado"
     não faz a mochila caber mais coisa, e uma barra que mudasse de
     denominador a cada aba mediria outra coisa a cada clique. */
  const ocupados = itens
    .filter((i) => i.local === "mochila")
    .reduce((s, i) => s + i.espacos * i.quantidade, 0);

  return (
    <div className="rc-inv" data-testid="console-inventario">
      <div className="rc-inv-col-esq">
        <div className="rc-inv-abas" role="tablist" aria-label="Onde o item está">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              className="rc-inv-aba"
              data-testid={`inv-aba-${a.id}`}
              onClick={() => setAba(a.id)}
            >
              {a.rotulo}
            </button>
          ))}
        </div>

        <div className="rc-inv-busca-linha">
          <span className="rc-inv-busca">
            <Search size={13} aria-hidden="true" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar item..."
              aria-label="Buscar item pelo nome ou categoria"
              data-testid="inv-busca"
            />
          </span>
          <button type="button" className="rc-inv-filtro" aria-label="Filtrar itens">
            <Filter size={13} aria-hidden="true" />
          </button>
        </div>

        {/* A BARRA É SEGMENTADA, não contínua: espaço é contado em
            unidades inteiras, e uma barra lisa sugeriria fração. */}
        <div className="rc-inv-capacidade">
          <span className="rc-inv-cap-rotulo">Capacidade</span>
          <span className="rc-inv-cap-valor">
            <strong>{ocupados}</strong>/{capacidadeTotal} espaços
          </span>
        </div>
        <div
          className="rc-inv-cap-barra"
          role="meter"
          aria-valuenow={ocupados}
          aria-valuemin={0}
          aria-valuemax={capacidadeTotal}
          aria-label="Espaços ocupados na mochila"
        >
          {Array.from({ length: capacidadeTotal }, (_, i) => (
            <span key={i} className="rc-inv-cap-bloco" data-cheio={i < ocupados || undefined} />
          ))}
        </div>

        <div className="rc-inv-grade" data-testid="inv-grade">
          {visiveis.map((item) => {
            const Icone = ICONE[item.familia];
            return (
              <button
                key={item.id}
                type="button"
                className="rc-inv-cartao"
                data-sel={item.id === selecionado?.id || undefined}
                data-familia={item.familia}
                data-testid="inv-cartao"
                onClick={() => { setSelecionadoId(item.id); setQuantidade(1); }}
              >
                <span className="rc-inv-cartao-ladrilho">
                  <Icone size={22} aria-hidden="true" />
                  {/* A quantidade some quando é 1: "x1" em todo cartão
                      vira ruído, e o que interessa é o que TEM MAIS DE UM. */}
                  {item.quantidade > 1 && <span className="rc-inv-cartao-qtd">x{item.quantidade}</span>}
                </span>
                <span className="rc-inv-cartao-txt">
                  <span className="rc-inv-cartao-nome">{item.nome}</span>
                  <span className="rc-inv-cartao-cat">{item.categoria}</span>
                </span>
              </button>
            );
          })}
          {/* O "+" é o último ladrilho, não um botão solto: ele ocupa o
              lugar do próximo item, que é onde o olho já está. */}
          <button type="button" className="rc-inv-cartao rc-inv-cartao--novo" aria-label="Adicionar item" data-testid="inv-novo">
            <Plus size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="rc-inv-col-dir">
        {selecionado ? (
          <>
            <div className="rc-inv-cabeca">
              <span className="rc-inv-cabeca-ladrilho" data-familia={selecionado.familia}>
                {(() => { const I = ICONE[selecionado.familia]; return <I size={26} aria-hidden="true" />; })()}
              </span>
              <span className="rc-inv-cabeca-txt">
                <h3 className="rc-inv-nome">{selecionado.nome}</h3>
                <span className="rc-inv-tags">
                  <span className="rc-inv-tag">{selecionado.categoria}</span>
                  {selecionado.raridade && <span className="rc-inv-tag" data-raridade="">{selecionado.raridade}</span>}
                </span>
              </span>
            </div>

            {selecionado.descricao && <p className="rc-inv-desc">{selecionado.descricao}</p>}

            <dl className="rc-inv-numeros">
              <div className="rc-inv-pa">
                <span className="rc-inv-num-rotulo">PA</span>
                <span className="rc-inv-pa-valor">
                  {selecionado.custoPa ?? "—"}
                  {/* Os losangos repetem o custo em FORMA: é assim que o
                      resto do Console mostra PA, e o número sozinho
                      exigiria ler pra saber que é "dois". */}
                  {typeof selecionado.custoPa === "number" && (
                    <span className="rc-inv-pips" aria-hidden="true">
                      {Array.from({ length: selecionado.custoPa }, (_, i) => <i key={i} />)}
                    </span>
                  )}
                </span>
              </div>
              <div className="rc-inv-num-cel">
                <span className="rc-inv-num-rotulo">Espaços/item</span>
                <dd>{selecionado.espacos}</dd>
              </div>
              <div className="rc-inv-num-cel">
                <span className="rc-inv-num-rotulo">Preço base</span>
                <dd>{selecionado.precoBase != null ? `₳ ${selecionado.precoBase}` : "—"}</dd>
              </div>
            </dl>

            {selecionado.propriedades && selecionado.propriedades.length > 0 && (
              <dl className="rc-inv-props">
                {selecionado.propriedades.map((p) => (
                  <div key={p.rotulo}>
                    <dt>{p.rotulo}</dt>
                    <dd>{p.valor}</dd>
                  </div>
                ))}
              </dl>
            )}

            {selecionado.efeito && selecionado.efeito.length > 0 && (
              <p className="rc-inv-efeito">
                {selecionado.efeito.map((parte, i) =>
                  typeof parte === "string"
                    ? <span key={i}>{parte}</span>
                    : <span key={i} className="rc-inv-chip" data-tom={parte.tom ?? "regra"}>{parte.termo}</span>,
                )}
              </p>
            )}

            <div className="rc-inv-rodape">
              <div className="rc-inv-stepper">
                <button
                  type="button" aria-label="Menos um"
                  disabled={quantidade <= 1}
                  onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                ><Minus size={14} aria-hidden="true" /></button>
                <span aria-live="polite">{quantidade}</span>
                <button
                  type="button" aria-label="Mais um"
                  disabled={quantidade >= selecionado.quantidade}
                  onClick={() => setQuantidade((q) => Math.min(selecionado.quantidade, q + 1))}
                ><Plus size={14} aria-hidden="true" /></button>
              </div>
              <div className="rc-inv-acoes">
                <button
                  type="button" className="rc-inv-btn rc-inv-btn--pri"
                  data-testid="inv-usar"
                  onClick={() => onUsar?.(selecionado, quantidade)}
                >Usar</button>
                <button
                  type="button" className="rc-inv-btn"
                  data-testid="inv-mover"
                  onClick={() => onMover?.(selecionado, quantidade)}
                >Mover</button>
              </div>
            </div>
          </>
        ) : (
          <div className="rc-inv-sem-selecao">
            <Package size={20} aria-hidden="true" />
            <span>Escolha um item para ver o que ele é.</span>
          </div>
        )}
      </div>
    </div>
  );
}
