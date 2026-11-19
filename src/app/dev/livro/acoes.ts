"use server";

import type { BlocoCompendio } from "../../../lib/compendio/tipos";
import { carregarBlocos } from "./dados";

/** O miolo do livro inteiro, de uma vez: o índice chega com a página, o texto vem logo atrás. */
export async function carregarLivroAction(): Promise<[string, BlocoCompendio[]][]> {
  // Mesma regra do `assertDevRouteAllowed`: fora de desenvolvimento, só com a flag.
  if (process.env.NODE_ENV === "production" && process.env.DEV_ROUTES_ENABLED !== "true") return [];
  return carregarBlocos();
}
