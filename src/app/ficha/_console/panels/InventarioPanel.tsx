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
import { TermoComDica } from "../TermoComDica";
import { DecoTop } from "../deco";
import { BODY_SLOT_LABELS, itemCabeNoSlot, type BodySlotId } from "../slots";
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

/**
 * Para onde "Mover" pode mandar um item.
 *
 * `slot` presente = vai pelo paper doll (`api.equiparNoSlot`), que já
 * trata armadura/escudo pelo fluxo defensivo; a compatibilidade sai de
 * `itemCabeNoSlot`, a MESMA regra que a aba de Equipamentos usa (uma
 * vertina não cabe em arma primária porque a categoria dela não é
 * "arma"). `estado` presente = mudança direta de loadout.
 *
 * Os slots de ARMADURA (cabeça, tronco, braços, pernas) e o de escudo
 * não estão aqui de propósito: quem veste armadura é o paper doll, que
 * mostra o corpo e a sobreposição. Repetir isso numa lista sem corpo
 * seria uma segunda porta pior para a mesma coisa.
 *
 * "Mochila" não estava na lista pedida, mas entrou: sem ela um item
 * mandado ao abrigo não teria como voltar.
 */
const DESTINOS: {
  id: string;
  label: string;
  slot?: BodySlotId;
  estado?: ItemLoadoutState;
  /** Sem caminho no servidor ainda — aparece, mas não clica. */
  indisponivel?: string;
}[] = [
  { id: "arma_primaria", label: "Arma primária", slot: "arma_primaria" },
  { id: "arma_secundaria", label: "Arma secundária", slot: "arma_secundaria" },
  { id: "acesso_rapido_1", label: "Acesso rápido 1", slot: "acesso_rapido_1" },
  { id: "acesso_rapido_2", label: "Acesso rápido 2", slot: "acesso_rapido_2" },
  { id: "mochila", label: "Mochila", estado: "mochila" },
  { id: "abrigo", label: "Abrigo", estado: "abrigo" },
  /* O BANDO ainda não recebe item do personagem. O servidor tem só o
     caminho inverso (`transferirItemBandoAction`, bando → personagem, e
     só para o narrador); mandar item PARA o bando não existe em ação
     nenhuma. Fica visível e travado com o motivo — esconder daria a
     entender que o destino não existe no jogo, quando o que falta é a
     ação. */
  { id: "bando", label: "Bando", indisponivel: "O bando ainda não recebe item do personagem." },
];

const OCULTAVEL_ROTULO: Record<string, string> = {
  sim: "Sim",
  parcial: "Parcialmente",
  nao: "Não",
};

/**
 * Ocultável? — e a lacuna de conteúdo por trás disto.
 *
 * `ocultavel` existe no payload SÓ de armadura e escudo. Nenhuma arma
 * declara o campo, e a linha precisa aparecer para elas.
 *
 * ⚠ REGRA A CONFIRMAR: na ausência do campo, a resposta sai da
 * `classe_porte`. Ocultar é uma pergunta de TAMANHO, e porte é o único
 * dado de tamanho que o item tem — leve esconde, pesada não esconde,
 * média esconde mal. Isso devolve Adaga (leve) = "Sim", que é o que o
 * dono do sistema afirmou, e Metralhadora (pesada) = "Não". Mas é
 * DERIVAÇÃO, não dado: no dia em que as armas declararem `ocultavel`,
 * o campo manda e esta tabela sai de cena.
 *
 * `null` = não dá para responder (item sem porte e sem o campo, caso
 * dos consumíveis) — e aí a linha não aparece, em vez de mostrar um
 * traço que não informa nada.
 */
const OCULTAVEL_POR_PORTE: Record<string, string> = {
  leve: "Sim",
  media: "Parcialmente",
  pesada: "Não",
};

function descricaoDeOcultavel(modelo: ItemContent | undefined): string | null {
  if (!modelo) return null;
  if (modelo.ocultavel) return OCULTAVEL_ROTULO[modelo.ocultavel] ?? modelo.ocultavel;
  if (modelo.classePorte) return OCULTAVEL_POR_PORTE[modelo.classePorte] ?? null;
  return null;
}

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
        <DecoTop />
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
            {/* SÓ NA MOCHILA. O medidor mede a mochila; sob "Equipado",
                "Abrigo" ou "Todos" ele mostraria um número que não é
                daquela lista — em Abrigo chega a ser o contrário do que
                a aba diz, já que o abrigo é justamente o que NÃO pesa. */}
            {filtro === "mochila" && (
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
            )}

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
                      {/* A quantidade aparece SEMPRE, inclusive no 1: a
                          caixinha é parte do desenho do cartão, e fazê-la
                          sumir deixa um canto vazio que se lê como falha. */}
                      <span className="rc-inv-qtd">x{instancia.quantidade}</span>
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
function descricaoDoDano(modelo: ItemContent | undefined): { dado: string; tipo: string | null } | null {
  if (!modelo?.danoBase) return null;
  const dado = modelo.danoBase;
  if (modelo.subtipoDano) return { dado, tipo: modelo.subtipoDano };
  if (modelo.subtiposDanoPossiveis.length > 0) {
    return { dado, tipo: modelo.subtiposDanoPossiveis.join(" ou ") };
  }
  return { dado, tipo: modelo.tipoDano };
}

/** O alcance como se lê: "Adjacente", "Adjacente (até 2 m)", "10 m (máx 20 m)". */
function descricaoDoAlcance(modelo: ItemContent | undefined): string | null {
  const a = modelo?.alcance;
  if (!a) return null;
  if (a.tipo === "adjacente") {
    return a.estendidoM != null ? `Adjacente (até ${a.estendidoM} m)` : "Adjacente";
  }
  if (a.tipo === "distancia" && a.eficazM != null) {
    return a.maxM != null ? `${a.eficazM} m (máx ${a.maxM} m)` : `${a.eficazM} m`;
  }
  return a.tipo;
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
  /* Descartar é irreversível e fica a um clique do contador — pedir
     confirmação é o mínimo. O estado é local ao item selecionado
     (`key` no pai reinicia ao trocar de item), então trocar de item
     com a confirmação aberta não deixa ela pendurada no próximo. */
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const [movendo, setMovendo] = useState(false);

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
      ? { rot: "Dano", val: dano.dado, sufixo: dano.tipo }
      : modelo?.custoPaUso != null
        ? { rot: "PA", val: String(modelo.custoPaUso), sufixo: null }
        : null;

  /* Propriedades, alcance e ocultável são a segunda tabela: o que a
     arma FAZ, separado do que ela custa. As propriedades vêm com dica,
     como ação e condição — só que soltas, não dentro de uma frase. */
  const propriedades = api.propriedadesDoItem(instancia.id);
  const alcance = descricaoDoAlcance(modelo);
  const ocultavel = descricaoDeOcultavel(modelo);
  const temSegundaTabela = propriedades.length > 0 || alcance != null || ocultavel != null;

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
              <span className="rc-inv-val">
                {principal.val}
                {/* O tipo de dano é qualificador do dado, não outro dado:
                    entra menor e mais apagado pra não competir com ele. */}
                {principal.sufixo && <em className="rc-inv-val-sufixo">{principal.sufixo}</em>}
              </span>
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

        {temSegundaTabela && (
          <dl className="rc-inv-linhas">
            {propriedades.length > 0 && (
              <div className="rc-inv-linha">
                <dt>Propriedades</dt>
                <dd className="rc-inv-linha-termos">
                  {propriedades.map((p) => (
                    <TermoComDica key={p.slug} termo={p} className="rc-termo rc-termo--prop">
                      {p.nome}
                    </TermoComDica>
                  ))}
                </dd>
              </div>
            )}
            {alcance && (
              <div className="rc-inv-linha">
                <dt>Alcance</dt>
                <dd>{alcance}</dd>
              </div>
            )}
            {ocultavel && (
              <div className="rc-inv-linha">
                <dt>Ocultável?</dt>
                <dd>{ocultavel}</dd>
              </div>
            )}
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

        {movendo && (
          <div className="rc-inv-mover" role="dialog" aria-label="Mover item para">
            <p className="rc-inv-mover-cab">Mover para</p>
            <div className="rc-inv-mover-lista">
              {DESTINOS.map((d) => {
                const cabe = d.slot ? itemCabeNoSlot(modelo, d.slot) : true;
                const jaEsta = d.estado != null && instancia.estado === d.estado;
                const motivo = d.indisponivel
                  ? d.indisponivel
                  : !cabe
                    ? `${modelo?.categoria_label ?? categoria} não vai para ${d.label.toLocaleLowerCase("pt-BR")}.`
                    : jaEsta
                      ? "O item já está aqui."
                      : null;
                return (
                  <button
                    key={d.id}
                    type="button"
                    className="rc-inv-mover-op"
                    disabled={motivo != null}
                    title={motivo ?? undefined}
                    onClick={() => {
                      setMovendo(false);
                      if (d.slot) api.equiparNoSlot(instancia.id, d.slot);
                      else if (d.estado) api.moverItemPara(instancia.id, d.estado);
                    }}
                  >
                    {d.label}
                    {motivo && <span className="rc-inv-mover-motivo">{motivo}</span>}
                  </button>
                );
              })}
            </div>
            <button type="button" className="rc-inv-btn" onClick={() => setMovendo(false)}>
              Cancelar
            </button>
          </div>
        )}

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
            aria-haspopup="dialog"
            aria-expanded={movendo}
            onClick={() => setMovendo((v) => !v)}
          >
            Mover
          </button>
        </div>
      </div>
    </div>
  );
}
