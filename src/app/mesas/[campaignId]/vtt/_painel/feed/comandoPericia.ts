/** Leitura pura de /p percepcao, /p luta etc. O catálogo vem das regras publicadas. */
export interface PericiaComando { id: string; nome: string; atributoPrimario?: string; atributosAlternativos?: { atributo: string; contexto: string }[] }
export interface ComandoPericia {
  periciaId: string;
  atributoId: "corpo" | "mente" | "animo" | null;
  modificador: number;
  cd: number | null;
}
export type LeituraPericia = { tipo: "texto" } | { tipo: "parcial" } | { tipo: "erro"; erro: string } | { tipo: "ok"; comando: ComandoPericia };

export function normalizarComando(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function lerComandoPericia(entrada: string, pericias: readonly PericiaComando[]): LeituraPericia {
  const texto = entrada.trim();
  if (!/^\/p(?:\s|$)/i.test(texto)) {
    const antigo = normalizarComando(texto.slice(1)).split(/\s+/)[0];
    if (texto.startsWith("/") && pericias.some((p) => normalizarComando(p.id) === antigo || normalizarComando(p.nome) === antigo)) {
      return { tipo: "erro", erro: `Use /p ${antigo} para rolar a perícia.` };
    }
    return { tipo: "texto" };
  }
  const corpo = normalizarComando(texto.slice(2).trim());
  if (!corpo) return { tipo: "parcial" };
  const candidatas = pericias.flatMap((p) => [p.nome, p.id].map((nome) => ({ p, chave: normalizarComando(nome) })));
  const encontrada = candidatas
    .filter(({ chave }) => corpo === chave || corpo.startsWith(`${chave} `))
    .sort((a, b) => b.chave.length - a.chave.length)[0];
  if (!encontrada) {
    return candidatas.some(({ chave }) => chave.startsWith(corpo))
      ? { tipo: "parcial" }
      : { tipo: "erro", erro: "Perícia indisponível para este personagem." };
  }
  const resto = corpo.slice(encontrada.chave.length).trim();
  if (!resto) return { tipo: "ok", comando: { periciaId: encontrada.p.id, atributoId: null, modificador: 0, cd: null } };
  const tokens = resto.split(/\s+/);
  let atributoId: ComandoPericia["atributoId"] = null;
  let modificador: number | null = null;
  let cd: number | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "corpo" || token === "mente" || token === "animo") {
      if (atributoId) return { tipo: "erro", erro: "Informe apenas um atributo." };
      atributoId = token;
    } else if (/^[+-]\d+$/.test(token)) {
      if (modificador !== null) return { tipo: "erro", erro: "Informe apenas um modificador." };
      modificador = Number(token);
      if (Math.abs(modificador) > 20) return { tipo: "erro", erro: "O modificador deve estar entre −20 e +20." };
    } else if (token === "cd" || /^cd\d+$/.test(token)) {
      if (cd !== null) return { tipo: "erro", erro: "Informe apenas uma CD." };
      const valor = token === "cd" ? tokens[++i] : token.slice(2);
      if (!valor || !/^\d+$/.test(valor)) return { tipo: "erro", erro: "Informe a CD como número. Exemplo: cd 11." };
      cd = Number(valor);
      if (!Number.isSafeInteger(cd) || cd < 1) return { tipo: "erro", erro: "A CD deve ser um inteiro positivo." };
    } else {
      return { tipo: "erro", erro: `Não entendi "${token}". Use atributo, +1, -1 ou cd 11.` };
    }
  }
  return { tipo: "ok", comando: { periciaId: encontrada.p.id, atributoId, modificador: modificador ?? 0, cd } };
}
