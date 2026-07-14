/** Geração/validação de slug — mesma convenção snake_case usada no conteúdo real (ex.: "energetica_bola_de_fogo", "artifice"). */

const MAPA_ACENTOS: Record<string, string> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", õ: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

function removerAcentos(texto: string): string {
  return texto
    .toLowerCase()
    .split("")
    .map((ch) => MAPA_ACENTOS[ch] ?? ch)
    .join("");
}

export function slugify(nome: string): string {
  return removerAcentos(nome.trim())
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

const SLUG_REGEX = /^[a-z][a-z0-9_]{1,63}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

export function slugDuplicadoSugerido(slugOriginal: string): string {
  return `${slugOriginal}_copia`;
}
