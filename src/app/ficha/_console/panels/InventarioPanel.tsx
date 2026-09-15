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
    <div className="rc-inv" data-testid="console-inventario">
      <div className="rc-inv-lista">
        <div className="rc-inv-filtros" role="tablist" aria-label="Onde o item está">
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
                className="rc-inv-filtro"
                data-ativo={filtro === f.id || undefined}
                onClick={() => setFiltro(f.id)}
              >
                {f.label}
                <span className="rc-inv-filtro-n">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="rc-inv-busca-linha">
          <div className="rc-inv-busca">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar item…"
              aria-label="Buscar item no inventário"
            />
          </div>
        </div>

        {/* Capacidade. O "12" é o que muda e por isso é o que pesa;
            "/15 espaços" é a moldura da informação, e em regular. */}
        <div className="rc-inv-cap">
          <div className="rc-inv-cap-cab">
            <span className="rc-inv-cap-rot">Capacidade</span>
            <span className="rc-inv-cap-num">
              <strong>{ocupados}</strong>
              <span className="rc-inv-cap-resto">/{capacidade} espaços</span>
            </span>
          </div>
          <div
            className="rc-inv-medidor"
            role="meter"
            aria-valuenow={ocupados}
            aria-valuemin={0}
            aria-valuemax={capacidade}
            aria-label="Espaços ocupados"
            data-excedido={excedido || undefined}
          >
            <div
              className="rc-inv-medidor-fill"
              style={{ width: `${Math.min(100, capacidade ? (ocupados / capacidade) * 100 : 0)}%` }}
            />
            <div className="rc-inv-medidor-marcas" aria-hidden="true">
              {Array.from({ length: Math.max(0, capacidade - 1) }, (_, i) => (
                <span key={i} />
              ))}
            </div>
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
                   custo em espaços é a informação, e mostrá-la como
                   área ocupada dispensa explicar de novo em texto.
                   Em 3 colunas, 3 espaços = a linha inteira. */
                style={{ gridColumn: `span ${Math.min(espacos, 3)}` }}
                aria-pressed={selecionado?.id === instancia.id}
                onClick={() => setSelecionadoId(instancia.id)}
              >
                <span className="rc-inv-ladrilho">
                  <IconeDaCategoria categoria={categoria} />
                  {instancia.quantidade > 1 && (
                    <span className="rc-inv-qtd">x{instancia.quantidade}</span>
                  )}
                </span>
                <span className="rc-inv-card-nome">{instancia.itemNome}</span>
                <span className="rc-inv-card-cat">
                  {modelo?.categoria_label ?? categoria}
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
  );
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
  const espacos = espacosDoItem(modelo);
  const destino = PROXIMO_ESTADO[instancia.estado];

  /* "Usar" só existe pra item que o conteúdo declara como usável —
     custo de PA estruturado ou cargas. Botão que não faz nada é pior
     que botão ausente, então ele fica desabilitado com o motivo. */
  const podeUsar = modelo != null && (modelo.custoPaUso != null || modelo.cargasMax != null);

  const linhas: { rot: string; val: string }[] = [];
  if (modelo?.danoBase) linhas.push({ rot: "Dano", val: modelo.danoBase });
  if (modelo?.areaMetros != null) linhas.push({ rot: "Área", val: `${modelo.areaMetros} m` });
  if (modelo?.alcanceArremessoMetros != null)
    linhas.push({ rot: "Alcance", val: `${modelo.alcanceArremessoMetros} m` });
  if (modelo?.custoPaUso != null) linhas.push({ rot: "Custo", val: `${modelo.custoPaUso} PA` });
  if (modelo?.custoPaUsoTexto) linhas.push({ rot: "Custo", val: modelo.custoPaUsoTexto });
  linhas.push({ rot: "Espaços/item", val: String(espacos) });
  if (modelo?.preco != null) linhas.push({ rot: "Preço base", val: `₳ ${modelo.preco}` });
  linhas.push({ rot: "Onde está", val: ROTULO_DO_ESTADO[instancia.estado] });

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

      {/* O tooltip de regra está ligado e testado (ação e condição, com
          a descrição publicada), mas HOJE ele quase não aparece: o
          `descricao_curta` dos 120 itens é texto de sabor, e nenhum
          deles cita uma ação ou condição capitalizada. Quem tem os
          termos é o texto de EFEITO — e no payload atual `estatisticas.efeito`
          vem como slug ("restringe_movimento"), não como frase. Quando
          o conteúdo passar a trazer a frase de efeito, é ela que entra
          aqui, e o grifo aparece sozinho: nada neste componente muda. */}
      {modelo?.descricao_curta && (
        <TextoComRegras
          className="rc-inv-det-desc"
          texto={modelo.descricao_curta}
          glossario={api.glossario}
        />
      )}

      <dl className="rc-inv-det-tabela">
        {linhas.map((l) => (
          <div key={l.rot} className="rc-inv-det-celula">
            <dt>{l.rot}</dt>
            <dd>{l.val}</dd>
          </div>
        ))}
      </dl>

      <div className="rc-inv-det-rodape">
        <div className="rc-inv-stepper">
          <button
            type="button"
            onClick={() => api.ajustarQuantidade(instancia.id, -1)}
            disabled={instancia.quantidade <= 1}
            aria-label="Diminuir quantidade"
          >
            −
          </button>
          <span aria-live="polite">{instancia.quantidade}</span>
          <button
            type="button"
            onClick={() => api.ajustarQuantidade(instancia.id, +1)}
            aria-label="Aumentar quantidade"
          >
            +
          </button>
        </div>
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
            onClick={() => api.moverItemPara(instancia.id, destino)}
          >
            Mover para {ROTULO_DO_ESTADO[destino]}
          </button>
          <button
            type="button"
            className="rc-inv-btn rc-inv-btn--perigo"
            onClick={() => api.descartarItem(instancia.id)}
          >
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}
