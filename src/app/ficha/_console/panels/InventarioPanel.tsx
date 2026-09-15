"use client";

/**
 * Aba INVENTÁRIO — a lista de itens do personagem, com detalhe ao lado.
 *
 * A disposição vem do desenho (nó 159:40520), que está copiado fiel na
 * galeria de estilos (`/dev/estilos`, aba "Inventário (Figma)") e
 * traduzido para a paleta do Console na aba ao lado. Aqui é a versão
 * VIVA: os mesmos blocos, com dados reais e as ações ligadas.
 *
 * Três coisas que este painel NÃO faz, de propósito:
 *
 *   - não calcula regra. Espaços ocupados, capacidade e o que pesa
 *     vêm prontos de `api.carga` (regra em `lib/character/carga.ts`);
 *     mover, usar, somar e descartar são chamadas de `api`, que por
 *     sua vez chamam fluxos que já logam e salvam.
 *
 *   - não mantém glossário. Os termos grifados dentro dos textos saem
 *     de `api.glossario`, que é conteúdo publicado.
 *
 *   - não tem arte por item. O desenho usa uma ilustração por item, e
 *     esse acervo não existe: cada categoria recebe um ícone da mesma
 *     família que o resto do Console usa. No dia em que houver arte,
 *     é só trocar `IconeDaCategoria` por uma imagem.
 */

import { useMemo, useState } from "react";
import {
  Bomb,
  Car,
  Cpu,
  FlaskConical,
  Package,
  Search,
  Shield,
  Shirt,
  Swords,
  Syringe,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { espacosDoItem } from "../../../../lib/character/carga";
import type { InventoryItemInstance, ItemContent, ItemLoadoutState } from "../../../../lib/character";
import { TextoComRegras } from "../TextoComRegras";
import type { ConsoleApi } from "../types";

/**
 * Categoria → VERTENTE. A cor de um item é a vertente dele, e essa
 * paleta já é canônica no VTT (`--rv-vertente-cor`, vtt.css — a mesma
 * do disco do token e da trilha de rodadas). Nenhum hexadecimal de
 * tipo mora neste arquivo.
 *
 * As dez categorias publicadas caem nas seis vertentes: munição segue
 * a arma que alimenta (cinética); armadura segue escudo (material);
 * ferramenta, dispositivo e veículo são o guarda-chuva "utilitário"
 * (sináptica).
 */
const VERTENTE_DA_CATEGORIA: Record<string, string> = {
  arma: "cinetica",
  municao: "cinetica",
  explosivo: "energetico",
  vertina: "cognitivo",
  escudo: "material",
  armadura: "material",
  farmacia: "somatico",
  ferramenta: "sinaptica",
  dispositivo: "sinaptica",
  veiculo: "sinaptica",
};

const ICONE_DA_CATEGORIA: Record<string, LucideIcon> = {
  arma: Swords,
  municao: Package,
  explosivo: Bomb,
  vertina: FlaskConical,
  escudo: Shield,
  armadura: Shirt,
  farmacia: Syringe,
  ferramenta: Wrench,
  dispositivo: Cpu,
  veiculo: Car,
};

/** Os quatro filtros do desenho. "Equipado" junta os três estados de porte no corpo. */
type FiltroId = "mochila" | "equipado" | "abrigo" | "todos";

const FILTROS: { id: FiltroId; label: string; estados: ItemLoadoutState[] | null }[] = [
  { id: "mochila", label: "Mochila", estados: ["mochila"] },
  // "Equipado" cobre equipado + empunhado + acesso rápido: do ponto de
  // vista de quem olha a aba, os três são "está comigo, pronto pra uso".
  { id: "equipado", label: "Equipado", estados: ["equipado", "empunhado", "acesso_rapido"] },
  { id: "abrigo", label: "Abrigo", estados: ["abrigo"] },
  { id: "todos", label: "Todos", estados: null },
];

const ROTULO_DO_ESTADO: Record<ItemLoadoutState, string> = {
  equipado: "Equipado",
  empunhado: "Empunhado",
  acesso_rapido: "Acesso rápido",
  mochila: "Mochila",
  abrigo: "Abrigo",
};

/** Para onde o botão "Mover" manda, a partir de onde o item está. */
const PROXIMO_ESTADO: Record<ItemLoadoutState, ItemLoadoutState> = {
  mochila: "acesso_rapido",
  acesso_rapido: "equipado",
  equipado: "abrigo",
  empunhado: "mochila",
  abrigo: "mochila",
};

function IconeDaCategoria({ categoria }: { categoria: string }) {
  const Icone = ICONE_DA_CATEGORIA[categoria] ?? Package;
  return <Icone size={30} strokeWidth={1.5} aria-hidden="true" />;
}

export function InventarioPanel({ api }: { api: ConsoleApi }) {
  const [filtro, setFiltro] = useState<FiltroId>("mochila");
  const [busca, setBusca] = useState("");
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const inventario = api.character.inventario ?? [];

  const visiveis = useMemo(() => {
    const def = FILTROS.find((f) => f.id === filtro)!;
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return inventario.filter((i) => {
      if (def.estados && !def.estados.includes(i.estado)) return false;
      if (!termo) return true;
      const modelo = api.catalogo.get(i.itemSlug);
      return (
        i.itemNome.toLocaleLowerCase("pt-BR").includes(termo) ||
        (modelo?.categoria_label ?? i.categoria).toLocaleLowerCase("pt-BR").includes(termo)
      );
    });
  }, [inventario, filtro, busca, api.catalogo]);

  /* A seleção segue o que está à vista: trocar de filtro ou buscar não
     pode deixar o painel de detalhe mostrando um item que sumiu da
     grade. Derivar em vez de guardar evita um efeito de sincronização. */
  const selecionado: InventoryItemInstance | null =
    visiveis.find((i) => i.id === selecionadoId) ?? visiveis[0] ?? null;
  const modeloSelecionado = selecionado ? api.catalogo.get(selecionado.itemSlug) : undefined;

  const { ocupados, capacidade, excedido } = api.carga;

  return (
    /* MESMA moldura da aba de Equipamentos (`.rc-eq-outer` +
       `.rc-eq-caption` + `.rc-eq-card-outer`): as duas abas são o par
       "o que eu tenho" e sem a moldura esta flutuava solta dentro do
       tabpanel. Só o título muda. */
    <section aria-label="Inventário" className="rc-eq-outer">
      <span className="rc-eq-caption">Inventário</span>
      <div className="rc-eq-card-outer rc-inv-moldura">
    <div className="rc-inv" data-testid="console-inventario">
      {/* As abas ATRAVESSAM as duas colunas, como no desenho: elas
          dizem o recorte da tela inteira, não só da lista. */}
      <div className="rc-inv-abas" role="tablist" aria-label="Onde o item está">
        {FILTROS.map((f) => {
          const n = f.estados
            ? inventario.filter((i) => f.estados!.includes(i.estado)).length
            : inventario.length;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filtro === f.id}
              className="rc-inv-aba"
              data-ativo={filtro === f.id || undefined}
              onClick={() => setFiltro(f.id)}
            >
              {f.label}
              <span className="rc-inv-aba-n">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="rc-inv-corpo">
        <div className="rc-inv-lista">
          <div className="rc-inv-busca-linha">
            <div className="rc-inv-busca">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar item..."
                aria-label="Buscar item no inventário"
              />
            </div>
          </div>

          <div className="rc-inv-rolo">
            {/* Capacidade. O número da ESQUERDA é o que muda, e por isso
                é o que pesa; "/15 espaços" é a moldura da informação. */}
            <div className="rc-inv-cap">
              <div className="rc-inv-cap-cab">
                <span className="rc-inv-cap-rot">Capacidade</span>
                <span className="rc-inv-cap-num">
                  <strong>{ocupados}</strong>
                  <span className="rc-inv-cap-resto">/{capacidade} espaços</span>
                </span>
              </div>
              {/* UM TRAÇO POR ESPAÇO. Antes o medidor era uma barra
                  contínua com marcas por cima em `space-between`, e as
                  marcas não coincidiam com unidade nenhuma — eram
                  decoração. Agora cada célula É um espaço: todas do
                  mesmo tamanho, e contar as cheias dá o número que está
                  escrito ao lado. */}
              <div
                className="rc-inv-medidor"
                role="meter"
                aria-valuenow={ocupados}
                aria-valuemin={0}
                aria-valuemax={capacidade}
                aria-label={`${ocupados} de ${capacidade} espaços ocupados`}
                data-excedido={excedido || undefined}
              >
                {Array.from({ length: capacidade }, (_, i) => (
                  <span key={i} className="rc-inv-medidor-un" data-cheio={i < ocupados || undefined} />
                ))}
              </div>
            </div>

            <div className="rc-inv-grade">
              {visiveis.map((instancia) => {
                const modelo = api.catalogo.get(instancia.itemSlug);
                const categoria = modelo?.categoria ?? instancia.categoria;
                const espacos = espacosDoItem(modelo);
                return (
                  <button
                    key={instancia.id}
                    type="button"
                    className="rc-inv-card"
                    data-vertente={VERTENTE_DA_CATEGORIA[categoria] ?? "nenhuma"}
                    data-selecionado={selecionado?.id === instancia.id || undefined}
                    /* Um item de 2 ou 3 espaços SE ESTENDE na grade: o
                       custo é a informação, e mostrá-lo como área
                       ocupada dispensa repeti-lo em texto. Hoje isso
                       nunca acontece — `espacosDoItem` devolve 1 pra
                       tudo enquanto a regra não existir (ver carga.ts). */
                    style={espacos > 1 ? { gridColumn: `span ${Math.min(espacos, 3)}` } : undefined}
                    aria-pressed={selecionado?.id === instancia.id}
                    onClick={() => setSelecionadoId(instancia.id)}
                  >
                    <span className="rc-inv-ladrilho">
                      <IconeDaCategoria categoria={categoria} />
                      {instancia.quantidade > 1 && (
                        <span className="rc-inv-qtd">x{instancia.quantidade}</span>
                      )}
                    </span>
                    {/* Nome e categoria num bloco só: no desenho eles são
                        um par colado, e o `gap: 10px` do cartão vale entre
                        ladrilho e par, não entre as duas linhas de texto. */}
                    <span className="rc-inv-card-rotulos">
                      <span className="rc-inv-card-nome">{instancia.itemNome}</span>
                      <span className="rc-inv-card-cat">{modelo?.categoria_label ?? categoria}</span>
                    </span>
                  </button>
                );
              })}
              {visiveis.length === 0 && (
                <p className="rc-inv-vazio">
                  {busca.trim()
                    ? "Nenhum item corresponde à busca."
                    : filtro === "abrigo"
                      ? "Nada guardado no abrigo."
                      : "Nenhum item aqui."}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rc-inv-detalhe">
          {selecionado ? (
            <DetalheDoItem
              key={selecionado.id}
              api={api}
              instancia={selecionado}
              modelo={modeloSelecionado}
            />
          ) : (
            <p className="rc-inv-vazio">Selecione um item para ver o detalhe.</p>
          )}
        </div>
      </div>
    </div>
      </div>
    </section>
  );
}

/**
 * O dano como o sistema o escreve: "1d6 cortante ou perfurante".
 *
 * Três casos, nesta ordem. Subtipo FIXO (`subtipo_dano`, ex.: a
 * carabina é perfurante) manda. Senão, os subtipos que o portador
 * ESCOLHE na hora (`subtipos_dano_possiveis`, ex.: a adaga corta ou
 * perfura) entram unidos por "ou". Só quando não há nenhum subtipo é
 * que o tipo aparece — "físico" e "energético" são a família, e dizer
 * "1d6 físico cortante" seria dizer duas vezes a mesma coisa, sendo a
 * primeira a menos informativa.
 */
function descricaoDoDano(modelo: ItemContent | undefined): string | null {
  if (!modelo?.danoBase) return null;
  if (modelo.subtipoDano) return `${modelo.danoBase} ${modelo.subtipoDano}`;
  if (modelo.subtiposDanoPossiveis.length > 0) {
    return `${modelo.danoBase} ${modelo.subtiposDanoPossiveis.join(" ou ")}`;
  }
  if (modelo.tipoDano) return `${modelo.danoBase} ${modelo.tipoDano}`;
  return modelo.danoBase;
}

function DetalheDoItem({
  api,
  instancia,
  modelo,
}: {
  api: ConsoleApi;
  instancia: InventoryItemInstance;
  modelo: ItemContent | undefined;
}) {
  const categoria = modelo?.categoria ?? instancia.categoria;
  const destino = PROXIMO_ESTADO[instancia.estado];
  /* Descartar é irreversível e fica a um clique do contador — pedir
     confirmação é o mínimo. O estado é local ao item selecionado
     (`key` no pai reinicia ao trocar de item), então trocar de item
     com a confirmação aberta não deixa ela pendurada no próximo. */
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);

  /* "Usar" só existe pra item que o conteúdo declara como usável —
     custo de PA estruturado ou cargas. Botão que não faz nada é pior
     que botão ausente, então ele fica desabilitado com o motivo. */
  const podeUsar = modelo != null && (modelo.custoPaUso != null || modelo.cargasMax != null);

  /* O destaque é a estatística que define o item: dano pra arma, custo
     de PA pra consumível. Sem nenhuma das duas o bloco não aparece —
     uma célula grande com um traço dentro é pior que nada. */
  const dano = descricaoDoDano(modelo);
  const principal =
    dano != null
      ? { rot: "Dano", val: dano }
      : modelo?.custoPaUso != null
        ? { rot: "PA", val: String(modelo.custoPaUso) }
        : null;

  const lado: { rot: string; val: string }[] = [
    { rot: "Espaços/item", val: String(espacosDoItem(modelo)) },
    ...(modelo?.preco != null ? [{ rot: "Preço base", val: `₳ ${modelo.preco}` }] : []),
  ];

  const linhas: { rot: string; val: string }[] = [];
  if (modelo?.alcanceArremessoMetros != null)
    linhas.push({ rot: "Alcance", val: `${modelo.alcanceArremessoMetros} metros` });
  if (modelo?.areaMetros != null) linhas.push({ rot: "Alvo", val: `${modelo.areaMetros} m de raio` });
  if (modelo?.custoPaUsoTexto) linhas.push({ rot: "Duração", val: modelo.custoPaUsoTexto });
  if (modelo?.municaoMax != null) linhas.push({ rot: "Munição", val: String(modelo.municaoMax) });
  /* "Tipo de dano" saiu: ele agora vive junto do dado, onde se lê de
     uma vez ("1d6 cortante ou perfurante"). "Onde está" saiu porque as
     abas já respondem isso, e o botão de mover diz o destino. */

  return (
    <div className="rc-inv-det" data-vertente={VERTENTE_DA_CATEGORIA[categoria] ?? "nenhuma"}>
      <div className="rc-inv-det-cab">
        <span className="rc-inv-ladrilho rc-inv-ladrilho--grande">
          <IconeDaCategoria categoria={categoria} />
        </span>
        <div className="rc-inv-det-titulo">
          <h3>{instancia.itemNome}</h3>
          <div className="rc-inv-etiquetas">
            <span className="rc-inv-etiqueta">{modelo?.categoria_label ?? categoria}</span>
            {modelo?.raridade && <span className="rc-inv-etiqueta">{modelo.raridade}</span>}
          </div>
        </div>
      </div>

      {modelo?.descricao_curta && (
        /* O tooltip de regra está ligado e testado, mas HOJE ele quase
           não aparece: o `descricao_curta` dos 120 itens é texto de
           sabor e nenhum cita uma ação ou condição capitalizada. Quem
           tem os termos é o texto de EFEITO, e no payload atual
           `estatisticas.efeito` vem como slug ("restringe_movimento"),
           não como frase. Quando o conteúdo trouxer a frase, é ela que
           entra aqui e o grifo aparece sozinho. */
        <TextoComRegras
          className="rc-inv-det-desc"
          texto={modelo.descricao_curta}
          glossario={api.glossario}
        />
      )}

      <div className="rc-inv-det-blocos">
        {principal && (
          <div className="rc-inv-destaque">
            <div className="rc-inv-destaque-principal">
              <span className="rc-inv-rot">{principal.rot}</span>
              <span className="rc-inv-val">{principal.val}</span>
            </div>
            <div className="rc-inv-destaque-lado">
              {lado.map((l) => (
                <div key={l.rot} className="rc-inv-mini">
                  <span className="rc-inv-rot">{l.rot}</span>
                  <span className="rc-inv-val">{l.val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(linhas.length > 0 || !principal) && (
        <dl className="rc-inv-linhas">
          {!principal &&
            lado.map((l) => (
              <div key={l.rot} className="rc-inv-linha">
                <dt>{l.rot}</dt>
                <dd>{l.val}</dd>
              </div>
            ))}
          {linhas.map((l) => (
            <div key={l.rot} className="rc-inv-linha">
              <dt>{l.rot}</dt>
              <dd>{l.val}</dd>
            </div>
          ))}
        </dl>
        )}
      </div>

      {/* Preso embaixo: a descrição pode rolar, e as ações do item não
          podem sumir junto com ela. */}
      <div className="rc-inv-det-rodape">
        <div className="rc-inv-stepper">
          <button
            type="button"
            className="rc-inv-passo"
            onClick={() => api.ajustarQuantidade(instancia.id, -1)}
            disabled={instancia.quantidade <= 1}
            aria-label="Diminuir quantidade"
          >
            −
          </button>
          <span aria-live="polite">{instancia.quantidade}</span>
          <button
            type="button"
            className="rc-inv-passo"
            onClick={() => api.ajustarQuantidade(instancia.id, +1)}
            aria-label="Aumentar quantidade"
          >
            +
          </button>
          {/* Descartar mora AQUI, não na linha de botões: o desenho tem
              duas ações naquela linha e um terceiro botão espremia a
              primária de 230 para 177. E descartar é da mesma família
              que o contador — as duas respondem "quanto disto eu
              tenho", sendo o descarte o zero. */}
          <button
            type="button"
            className="rc-inv-stepper-descartar"
            onClick={() => setConfirmandoDescarte(true)}
            aria-label={`Descartar ${instancia.itemNome}`}
            title="Descartar o item inteiro"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>

        {confirmandoDescarte && (
          <div className="rc-inv-confirma" role="alertdialog" aria-label="Confirmar descarte">
            <p>
              Descartar <strong>{instancia.itemNome}</strong>
              {instancia.quantidade > 1 ? ` (${instancia.quantidade} unidades)` : ""}? Não dá para desfazer.
            </p>
            <div className="rc-inv-confirma-acoes">
              <button type="button" className="rc-inv-btn" onClick={() => setConfirmandoDescarte(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="rc-inv-btn rc-inv-btn--perigo"
                autoFocus
                onClick={() => {
                  setConfirmandoDescarte(false);
                  api.descartarItem(instancia.id);
                }}
              >
                Descartar
              </button>
            </div>
          </div>
        )}
        <div className="rc-inv-det-acoes">
          <button
            type="button"
            className="rc-inv-btn rc-inv-btn--primaria"
            disabled={!podeUsar}
            title={podeUsar ? undefined : "Este item não declara uso automatizável."}
            onClick={() => api.usarItem(instancia.id)}
          >
            Usar
          </button>
          <button
            type="button"
            className="rc-inv-btn"
            title={`Mover para ${ROTULO_DO_ESTADO[destino]}`}
            onClick={() => api.moverItemPara(instancia.id, destino)}
          >
            Mover
          </button>
        </div>
      </div>
    </div>
  );
}
