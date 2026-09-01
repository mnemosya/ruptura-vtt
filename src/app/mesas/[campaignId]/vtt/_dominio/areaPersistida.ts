/**
 * Ponte entre a LINHA persistida de `vtt_areas` e os parâmetros
 * canônicos do domínio (`ParametrosArea`) — PURA, nos dois sentidos, e
 * num lugar só. Sem isto, a mesma tradução apareceria no cliente, na
 * borda de ação e nos testes, com três chances de divergir.
 *
 * O tipo de entrada é ESTRUTURAL de propósito (não `import type
 * { AreaVtt }` de `lib/vtt/sceneStorage.ts`): aquele módulo importa
 * `"server-only"`, e este roda no cliente. Mesma decisão já tomada em
 * `_dominio/tokenApresentacao.ts`, pelo mesmo motivo.
 */

import type { CorArea, ModoLinha, ParametrosArea, PontoAxial, TipoArea } from "./areaEfeito";

export interface AreaPersistidaBruta {
  id: string;
  tipo: TipoArea;
  origemQ: number | null;
  origemR: number | null;
  direcaoGraus: number | null;
  raioM: number | null;
  comprimentoM: number | null;
  larguraM: number | null;
  alturaM: number | null;
  ladoM: number | null;
  aberturaGraus: number | null;
  nivelOrigemM: number | null;
  modoLinha: ModoLinha | null;
  pontos: { q: number; r: number }[] | null;
  tokenId: string | null;
  cor: string;
  opacidade: number;
  rotulo: string | null;
  visivel: boolean;
  criadorId: string;
  revision: number;
}

/**
 * Linha → parâmetros. `origemAura` é a ORIGEM LÓGICA ATUAL do token
 * vinculado, calculada por quem chama a partir da posição e da pegada
 * correntes — é isto que faz a aura acompanhar movimento, rotação e
 * troca de pegada sem nunca regravar a linha.
 *
 * Devolve `null` quando a linha não descreve geometria utilizável: uma
 * aura cujo token sumiu (ou que este usuário não pode ver), ou uma
 * linha com campo obrigatório ausente. Estado inválido CONTROLADO — a
 * área simplesmente não é desenhada, nunca desenhada errado.
 */
export function parametrosDaAreaPersistida(a: AreaPersistidaBruta, origemAura: PontoAxial | null): ParametrosArea | null {
  const origem: PontoAxial | null = a.origemQ !== null && a.origemR !== null ? { q: a.origemQ, r: a.origemR } : null;
  switch (a.tipo) {
    case "esfera":
      if (!origem || a.raioM === null) return null;
      return { tipo: "esfera", origem, raioM: a.raioM, alturaM: a.alturaM, nivelOrigemM: a.nivelOrigemM };
    case "domo":
      if (!origem || a.raioM === null) return null;
      return { tipo: "domo", origem, raioM: a.raioM, alturaM: a.alturaM, nivelOrigemM: a.nivelOrigemM };
    case "aura":
      if (!origemAura || a.raioM === null || !a.tokenId) return null;
      return { tipo: "aura", origem: origemAura, raioM: a.raioM, tokenId: a.tokenId };
    case "linha":
      if (!origem || a.direcaoGraus === null || a.comprimentoM === null || !a.modoLinha) return null;
      return { tipo: "linha", origem, direcaoGraus: a.direcaoGraus, comprimentoM: a.comprimentoM, modo: a.modoLinha };
    case "faixa":
      if (!origem || a.direcaoGraus === null || a.comprimentoM === null || a.larguraM === null) return null;
      return { tipo: "faixa", origem, direcaoGraus: a.direcaoGraus, comprimentoM: a.comprimentoM, larguraM: a.larguraM };
    case "parede":
      if (!a.pontos || a.pontos.length < 2 || a.alturaM === null) return null;
      return { tipo: "parede", pontos: a.pontos.map((p) => ({ q: Number(p.q), r: Number(p.r) })), alturaM: a.alturaM };
    case "cubo":
      if (!origem || a.direcaoGraus === null || a.ladoM === null) return null;
      return { tipo: "cubo", origem, direcaoGraus: a.direcaoGraus, ladoM: a.ladoM };
    case "cone":
      if (!origem || a.direcaoGraus === null || a.comprimentoM === null) return null;
      return { tipo: "cone", origem, direcaoGraus: a.direcaoGraus, alcanceM: a.comprimentoM };
    case "personalizada":
      if (!a.pontos || a.pontos.length < 3) return null;
      return { tipo: "personalizada", pontos: a.pontos.map((p) => ({ q: Number(p.q), r: Number(p.r) })) };
  }
}

export interface CamposPersistenciaArea {
  origemQ: number | null;
  origemR: number | null;
  direcaoGraus: number | null;
  raioM: number | null;
  comprimentoM: number | null;
  larguraM: number | null;
  alturaM: number | null;
  ladoM: number | null;
  nivelOrigemM: number | null;
  modoLinha: ModoLinha | null;
  pontos: { q: number; r: number }[] | null;
  tokenId: string | null;
}

/**
 * Parâmetros → colunas. Note o que NÃO vai: `aberturaGraus` (o servidor
 * fixa 45° no cone), a largura da parede (o servidor fixa 1 m) e a
 * altura do cubo (o servidor iguala ao lado). Regra fixa não trafega
 * pelo cliente — se trafegasse, seria negociável.
 *
 * A ORIGEM de uma aura também não vai: ela é derivada do token toda vez
 * que a área é desenhada. Persistir a posição do token dentro da aura
 * criaria uma segunda verdade que envelheceria no primeiro movimento.
 */
export function camposDeParametros(p: ParametrosArea): CamposPersistenciaArea {
  const vazio: CamposPersistenciaArea = {
    origemQ: null, origemR: null, direcaoGraus: null, raioM: null, comprimentoM: null, larguraM: null,
    alturaM: null, ladoM: null, nivelOrigemM: null, modoLinha: null, pontos: null, tokenId: null,
  };
  switch (p.tipo) {
    case "esfera":
    case "domo":
      return { ...vazio, origemQ: p.origem.q, origemR: p.origem.r, raioM: p.raioM, alturaM: p.alturaM, nivelOrigemM: p.nivelOrigemM };
    case "aura":
      return { ...vazio, raioM: p.raioM, tokenId: p.tokenId };
    case "linha":
      return { ...vazio, origemQ: p.origem.q, origemR: p.origem.r, direcaoGraus: p.direcaoGraus, comprimentoM: p.comprimentoM, modoLinha: p.modo };
    case "faixa":
      return { ...vazio, origemQ: p.origem.q, origemR: p.origem.r, direcaoGraus: p.direcaoGraus, comprimentoM: p.comprimentoM, larguraM: p.larguraM };
    case "parede":
      return { ...vazio, pontos: p.pontos.map((v) => ({ q: v.q, r: v.r })), alturaM: p.alturaM, larguraM: 1 };
    case "cubo":
      return { ...vazio, origemQ: p.origem.q, origemR: p.origem.r, direcaoGraus: p.direcaoGraus, ladoM: p.ladoM, alturaM: p.ladoM };
    case "cone":
      return { ...vazio, origemQ: p.origem.q, origemR: p.origem.r, direcaoGraus: p.direcaoGraus, comprimentoM: p.alcanceM };
    case "personalizada":
      return { ...vazio, pontos: p.pontos.map((v) => ({ q: v.q, r: v.r })) };
  }
}

/** Slug de cor persistido → slug do domínio, com queda segura pro padrão. */
export function corValida(bruta: string): CorArea {
  const validas: readonly string[] = ["ciano", "ambar", "verde", "vermelho", "roxo", "branco"];
  return (validas.includes(bruta) ? bruta : "ciano") as CorArea;
}
