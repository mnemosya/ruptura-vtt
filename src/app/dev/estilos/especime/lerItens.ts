/**
 * Parse dos itens vindos da query string — módulo SEM `"use client"`.
 *
 * Mora separado de propósito: as rotas de espécime são Server
 * Components e chamam esta função direto. Ela nasceu dentro de
 * `Especimes.tsx`, que é cliente, e o Next recusou em runtime
 * ("Attempted to call lerItens() from the server but lerItens is on
 * the client") — o iframe inteiro caía na tela de erro.
 */

import type { Item } from "./Especimes";

export function lerItens(bruto: string | undefined): Item[] {
  return (bruto ?? "")
    .split("~")
    .map((linha) => linha.split("|"))
    .filter((p) => p[0])
    .map(([classe, rotulo, papel]) => ({ classe, rotulo: rotulo || "—", papel: papel || "" }));
}
