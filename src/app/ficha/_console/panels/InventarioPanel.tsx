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
 *   - não tem arte por item. O desenho usa uma ilustração por item, mas
 *     esse acervo ainda não existe.
 */

import { useState } from "react";
import { espacosDaInstancia, espacosDoItem } from "../../../../lib/character/carga";
import type { InventoryItemInstance, ItemContent, ItemLoadoutState } from "../../../../lib/character";
import { TextoComRegras } from "../TextoComRegras";
import { itemCabeNoSlot, type BodySlotId } from "../slots";
import type { ConsoleApi } from "../types";
import { CabecalhoModulo } from "./CabecalhoModulo";
import { InventarioHud, type DestinoHud, type ItemHud, type LocalHud } from "./inventario/InventarioHud";
import { MercadoHud, type ProdutoHud } from "./hud/MercadoHud";

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
export const VERTENTE_DA_CATEGORIA: Record<string, string> = {
  arma: "cinetica",
  municao: "cinetica",
  explosivo: "energetica",
  vertina: "cognitiva",
  escudo: "material",
  armadura: "material",
  farmacia: "biotica",
  ferramenta: "sinaptica",
  dispositivo: "sinaptica",
  veiculo: "sinaptica",
};

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

export function descricaoDeOcultavel(modelo: ItemContent | undefined): string | null {
  if (!modelo) return null;
  if (modelo.ocultavel) return OCULTAVEL_ROTULO[modelo.ocultavel] ?? modelo.ocultavel;
  if (modelo.classePorte) return OCULTAVEL_POR_PORTE[modelo.classePorte] ?? null;
  return null;
}

/**
 * CARTEIRA (INV-03) — leitura e edição do contrato `carteira` que já
 * existe (PRD 13.1: três saldos separados, nunca uma soma única).
 *
 * O campo aceita as três formas de mexer no saldo, porque as três são
 * gestos reais: o valor final (`900`), um delta (`+250`, `-150`) e uma
 * conta escrita por cima do que já estava lá (`3000-555`).
 *
 * A terceira existe porque o campo abre COM o saldo dentro: clicar no
 * valor e continuar digitando produz `3000-555` naturalmente, e a
 * primeira versão recusava justamente esse caso — o mais provável de
 * todos.
 *
 * A conta é resolvida NO ENVIO, contra o saldo que está na ficha
 * naquele instante, e o que vai para o servidor é o valor absoluto.
 * Mandar o delta faria o resultado depender de quando a tela
 * renderizou.
 *
 * A escrita segue o caminho de qualquer alteração de ficha, que
 * revalida controle no servidor — nenhuma porta nova.
 *
 * Aretz em destaque, porque é a moeda corrente. CDI e CDI craqueada só
 * aparecem quando há saldo: três zeros lado a lado dariam a impressão
 * de três carteiras vazias, quando na verdade a pessoa só nunca
 * encostou nas outras duas.
 */
function saldoDoTexto(texto: string, saldo: number): number | null {
  // Separador de milhar do que já estava na tela sai fora; espaços
  // também, para `3000 - 555` valer o mesmo que `3000-555`.
  const bruto = texto.trim().replace(/\./g, "").replace(/\s+/g, "");
  if (!/^[+-]?\d+([+-]\d+)*$/.test(bruto)) return null;
  /* Começando com sinal (`+250`), é DELTA sobre o saldo; sem sinal
     inicial (`3000-555`), é uma CONTA a resolver — é o que sai de
     clicar no valor e continuar digitando. */
  const soma = (bruto.match(/[+-]?\d+/g) ?? []).map(Number).reduce((a, b) => a + b, 0);
  return /^[+-]/.test(bruto) ? saldo + soma : soma;
}

/** Os três estados de porte no corpo caem na aba "Equipado". */
const LOCAL_DO_ESTADO: Record<ItemLoadoutState, LocalHud> = {
  equipado: "equipado",
  empunhado: "equipado",
  acesso_rapido: "equipado",
  mochila: "mochila",
  abrigo: "abrigo",
};

/**
 * Instância + modelo → o que o HUD desenha. Toda a leitura de conteúdo
 * mora aqui; o `InventarioHud` não conhece `ItemContent`.
 */
function itemDoHud(api: ConsoleApi, instancia: InventoryItemInstance): ItemHud {
  const modelo = api.catalogo.get(instancia.itemSlug);
  const categoria = modelo?.categoria ?? instancia.categoria;
  const dano = descricaoDoDano(modelo);
  const alcance = descricaoDoAlcance(modelo);
  const ocultavel = descricaoDeOcultavel(modelo);

  const linhas: { rotulo: string; valor: string }[] = [];
  if (alcance) linhas.push({ rotulo: "Alcance", valor: alcance });
  if (modelo?.alcanceArremessoMetros != null) linhas.push({ rotulo: "Arremesso", valor: `${modelo.alcanceArremessoMetros} m` });
  if (modelo?.areaMetros != null) linhas.push({ rotulo: "Alvo", valor: `${modelo.areaMetros} m de raio` });
  if (modelo?.custoPaUsoTexto) linhas.push({ rotulo: "Duração", valor: modelo.custoPaUsoTexto });
  if (ocultavel) linhas.push({ rotulo: "Ocultável", valor: ocultavel });

  const local = LOCAL_DO_ESTADO[instancia.estado];
  return {
    id: instancia.id,
    nome: instancia.itemNome,
    categoria,
    categoriaRotulo: modelo?.categoria_label ?? categoria,
    vertente: VERTENTE_DA_CATEGORIA[categoria] ?? "nenhuma",
    raridade: modelo?.raridade ?? null,
    quantidade: instancia.quantidade,
    local,
    localRotulo: local === "equipado" && instancia.estado !== "equipado" ? ROTULO_DO_ESTADO[instancia.estado] : undefined,
    espacosPorItem: espacosDoItem(modelo),
    ocupa: espacosDaInstancia(instancia, modelo),
    preco: modelo?.preco ?? null,
    descricao: modelo?.descricao_curta
      ? <TextoComRegras texto={modelo.descricao_curta} glossario={api.glossario} />
      : null,
    destaque: dano ? { rotulo: "Dano", valor: dano.dado, sufixo: dano.tipo } : null,
    pa: modelo?.custoPaUso ?? null,
    cargas: modelo?.cargasMax != null ? [instancia.cargasAtual ?? modelo.cargasMax, modelo.cargasMax] : null,
    municao: modelo?.municaoMax != null ? [instancia.municaoAtual ?? modelo.municaoMax, modelo.municaoMax] : null,
    linhas,
    propriedades: api.propriedadesDoItem(instancia.id).map((t) => t.nome),
    usavel: modelo != null && (modelo.custoPaUso != null || modelo.cargasMax != null),
  };
}

/** Modelo do catálogo → produto do Mercado. Mesma leitura de conteúdo da ficha do item. */
function produtoDoModelo(api: ConsoleApi, modelo: ItemContent): ProdutoHud {
  const dano = descricaoDoDano(modelo);
  const alcance = descricaoDoAlcance(modelo);
  const ocultavel = descricaoDeOcultavel(modelo);
  const linhas: { rotulo: string; valor: string }[] = [];
  if (alcance) linhas.push({ rotulo: "Alcance", valor: alcance });
  if (modelo.alcanceArremessoMetros != null) linhas.push({ rotulo: "Arremesso", valor: `${modelo.alcanceArremessoMetros} m` });
  if (modelo.areaMetros != null) linhas.push({ rotulo: "Área", valor: `${modelo.areaMetros} m de raio` });
  if (modelo.mitMax != null) linhas.push({ rotulo: "MIT", valor: String(modelo.mitMax) });
  if (modelo.pdMax != null) linhas.push({ rotulo: "PD", valor: String(modelo.pdMax) });
  if (ocultavel) linhas.push({ rotulo: "Ocultável", valor: ocultavel });
  const nomes = new Map(api.glossario.filter((t) => t.tipo === "propriedade").map((t) => [t.slug, t.nome]));
  return {
    slug: modelo.slug,
    nome: modelo.nome,
    categoria: modelo.categoria,
    categoriaRotulo: modelo.categoria_label ?? modelo.categoria,
    vertente: VERTENTE_DA_CATEGORIA[modelo.categoria] ?? "nenhuma",
    preco: modelo.preco ?? 0,
    espacos: espacosDoItem(modelo),
    raridade: modelo.raridade ?? null,
    descricao: modelo.descricao_curta ? <TextoComRegras texto={modelo.descricao_curta} glossario={api.glossario} /> : null,
    destaque: dano ? { rotulo: "Dano", valor: dano.dado, sufixo: dano.tipo } : null,
    propriedades: modelo.propertySlugs.map((s) => nomes.get(s) ?? s),
    linhas,
    pa: modelo.custoPaUso ?? null,
    municao: modelo.municaoMax,
    cargas: modelo.cargasMax ?? null,
  };
}

export function InventarioPanel({ api }: { api: ConsoleApi }) {
  const [mercado, setMercado] = useState(false);
  const inventario = api.character.inventario ?? [];
  const itens = inventario.map((i) => itemDoHud(api, i));
  const porId = new Map(inventario.map((i) => [i.id, i]));
  const aretz = api.character.carteira?.aretz_informal ?? null;

  const destinosDe = (item: ItemHud): DestinoHud[] => {
    const instancia = porId.get(item.id);
    const modelo = instancia ? api.catalogo.get(instancia.itemSlug) : undefined;
    return DESTINOS.map((d) => {
      const cabe = d.slot ? itemCabeNoSlot(modelo, d.slot) : true;
      const jaEsta = d.estado != null && instancia?.estado === d.estado;
      return {
        id: d.id,
        rotulo: d.label,
        motivo: d.indisponivel ?? (!cabe
          ? `${item.categoriaRotulo} não vai para ${d.label.toLocaleLowerCase("pt-BR")}.`
          : jaEsta ? "O item já está aqui." : null),
      };
    });
  };

  return (
    /* A moldura e o cabeçalho canônicos do Console (os mesmos da aba de
       Equipamentos); o miolo é o HUD do protótipo. */
    <section aria-label="Inventário" className="rc-eq-outer">
      <div className="rc-eq-card-outer rc-inv-moldura">
        <CabecalhoModulo id="ID://INVENTÁRIO" mod="MOD.INV // 05" />
        <div className="rc-inv" data-testid="console-inventario" style={{ position: "relative" }}>
          {/* O Mercado abre POR CIMA do corpo do Console, dentro da moldura. */}
          {mercado && (
            <div style={{ position: "absolute", inset: 0, zIndex: 40, padding: 12, background: "rgba(6,18,28,.8)", backdropFilter: "blur(3px)" }}
              onClick={(e) => { if (e.target === e.currentTarget) setMercado(false); }}>
              <MercadoHud
                produtos={[...api.catalogo.values()].filter((m) => (m.preco ?? 0) > 0).map((m) => produtoDoModelo(api, m))}
                saldo={aretz ?? 0}
                usados={api.carga.ocupados}
                capacidade={api.carga.capacidade}
                onComprar={(slug, n) => {
                  const modelo = api.catalogo.get(slug);
                  if (modelo) api.comprarItem(slug, n, "aretz_informal", modelo.preco ?? 0);
                }}
                onFechar={() => setMercado(false)}
              />
            </div>
          )}
          <InventarioHud
            itens={itens}
            capacidade={api.carga.capacidade}
            aretz={aretz}
            somenteLeitura={api.somenteLeitura}
            onDefinirAretz={(texto) => {
              if (aretz == null) return null;
              const alvo = saldoDoTexto(texto, aretz);
              if (alvo == null) return "Use um número, ou some e subtraia: +250, -150, 3000-555.";
              api.definirCarteira("aretz_informal", alvo);
              return null;
            }}
            destinosDe={destinosDe}
            onUsar={(id) => api.usarItem(id)}
            onAjustar={(id, d) => api.ajustarQuantidade(id, d)}
            onMover={(id, destinoId) => {
              const d = DESTINOS.find((x) => x.id === destinoId);
              if (d?.slot) api.equiparNoSlot(id, d.slot);
              else if (d?.estado) api.moverItemPara(id, d.estado);
            }}
            onDescartar={(id) => api.descartarItem(id)}
            onAbrirMercado={api.somenteLeitura ? undefined : () => setMercado(true)}
          />
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
export function descricaoDoDano(modelo: ItemContent | undefined): { dado: string; tipo: string | null } | null {
  if (!modelo?.danoBase) return null;
  const dado = modelo.danoBase;
  if (modelo.subtipoDano) return { dado, tipo: modelo.subtipoDano };
  if (modelo.subtiposDanoPossiveis.length > 0) {
    return { dado, tipo: modelo.subtiposDanoPossiveis.join(" ou ") };
  }
  return { dado, tipo: modelo.tipoDano };
}

/** O alcance como se lê: "Adjacente", "Adjacente (até 2 m)", "10 m (máx 20 m)". */
export function descricaoDoAlcance(modelo: ItemContent | undefined): string | null {
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
