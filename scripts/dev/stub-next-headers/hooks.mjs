/** Resolve `next/headers` para o stub — e só ele; todo o resto segue. */
const STUB = new URL("./cookies.mjs", import.meta.url).href;

export function resolve(especificador, contexto, proximo) {
  if (especificador === "next/headers") return { url: STUB, shortCircuit: true };
  return proximo(especificador, contexto);
}
