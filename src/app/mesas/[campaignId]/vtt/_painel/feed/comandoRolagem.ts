/**
 * ATALHO DE ROLAGEM NO CHAT — `/r 1d8 + 2`.
 *
 * O composer é uma linha de comando (o prompt `›` do design diz isso),
 * e este módulo é a única coisa que entende o que foi digitado. É
 * PURO: não rola nada, não fala com servidor nenhum — transforma texto
 * numa intenção de rolagem, ou numa mensagem de erro em português que
 * o composer mostra. Assim dá pra testar cada caso sem DOM e sem rede.
 *
 * Gramática aceita (tudo sem diferenciar maiúsculas):
 *
 *     /r  1d8
 *     /r  1d8 + 2          modificador
 *     /r  1d8 + 1d6        vários grupos
 *     /r  2d6 - 1          modificador negativo
 *     /r  d20              quantidade omitida = 1
 *     /rolar 3d6           forma longa, pra quem já tinha o hábito
 *
 * O que NÃO é comando passa reto como mensagem normal: uma frase que
 * começa com "/" mas não é `/r` continua sendo texto (pode ser uma
 * data, um caminho de arquivo, uma piada).
 */

/** Faces que a mesa sabe desenhar — o mesmo conjunto da ferramenta de dados. */
export const FACES_ACEITAS = [4, 6, 8, 10, 12, 20, 100] as const;
/** Mesmos tetos que o servidor aplica (`rolagemPainel.ts`) — recusar aqui dá erro imediato, em vez de ida e volta. */
export const DADOS_MAX = 20;
export const MODIFICADOR_MAX = 20;

export interface GrupoDeDados {
  quantidade: number;
  faces: number;
}

export interface ComandoRolagem {
  grupos: GrupoDeDados[];
  modificador: number;
  /** Quantos dados no total — útil pro limite e pra montar a física. */
  total: number;
}

export type LeituraComando =
  /** Não começa por `/r` — é mensagem comum, segue o caminho normal. */
  | { tipo: "texto" }
  | { tipo: "ok"; comando: ComandoRolagem }
  | { tipo: "erro"; erro: string };

/* `rolar` ANTES de `r` na alternância: a regex escolhe o primeiro ramo
   que casa, e `/r` sozinho comeria só o "r" de "/rolar", deixando
   "olar 3d6" pra trás. */
const PREFIXO = /^\/(rolar|r)(\s|$)/i;
/** `2d6`, `d20`, `10d4` — quantidade opcional. */
const TERMO_DADOS = /^(\d*)d(\d+)$/i;
const TERMO_NUMERO = /^\d+$/;

export function lerComandoRolagem(entrada: string): LeituraComando {
  const texto = entrada.trim();
  if (!PREFIXO.test(texto)) return { tipo: "texto" };

  const corpo = texto.replace(/^\/(rolar|r)/i, "").trim();
  if (corpo === "") {
    return { tipo: "erro", erro: "Diga o que rolar. Exemplo: /r 1d8 + 2" };
  }

  /* Separa em termos preservando o sinal: "1d8+2-1" e "1d8 + 2 - 1"
     são a mesma coisa, então o espaço não pode ser o separador. */
  const termos: { sinal: 1 | -1; texto: string }[] = [];
  let sinal: 1 | -1 = 1;
  let atual = "";
  for (const ch of corpo) {
    if (ch === "+" || ch === "-") {
      if (atual.trim() !== "") {
        termos.push({ sinal, texto: atual.trim() });
        atual = "";
      } else if (termos.length > 0) {
        return { tipo: "erro", erro: `Sinal repetido perto de "${ch}".` };
      }
      sinal = ch === "-" ? -1 : 1;
      continue;
    }
    if (ch === " " || ch === "\t") continue; // "1 d 8" também vale
    atual += ch;
  }
  if (atual.trim() !== "") termos.push({ sinal, texto: atual.trim() });
  if (termos.length === 0) return { tipo: "erro", erro: "Diga o que rolar. Exemplo: /r 1d8 + 2" };

  const grupos: GrupoDeDados[] = [];
  let modificador = 0;

  for (const termo of termos) {
    const dados = TERMO_DADOS.exec(termo.texto);
    if (dados) {
      if (termo.sinal === -1) {
        return { tipo: "erro", erro: `Não dá pra subtrair dados ("−${termo.texto}"). Só o modificador pode ser negativo.` };
      }
      const quantidade = dados[1] === "" ? 1 : Number.parseInt(dados[1], 10);
      const faces = Number.parseInt(dados[2], 10);
      if (quantidade < 1) return { tipo: "erro", erro: `"${termo.texto}" não tem dado nenhum.` };
      if (!(FACES_ACEITAS as readonly number[]).includes(faces)) {
        return { tipo: "erro", erro: `d${faces} não existe na mesa. Disponíveis: ${FACES_ACEITAS.map((f) => `d${f}`).join(", ")}.` };
      }
      grupos.push({ quantidade, faces });
      continue;
    }
    if (TERMO_NUMERO.test(termo.texto)) {
      modificador += termo.sinal * Number.parseInt(termo.texto, 10);
      continue;
    }
    return { tipo: "erro", erro: `Não entendi "${termo.texto}". Use algo como /r 1d8 + 2.` };
  }

  if (grupos.length === 0) {
    return { tipo: "erro", erro: "Falta o dado. Exemplo: /r 1d8 + 2" };
  }
  const total = grupos.reduce((n, g) => n + g.quantidade, 0);
  if (total > DADOS_MAX) {
    return { tipo: "erro", erro: `No máximo ${DADOS_MAX} dados por rolagem (você pediu ${total}).` };
  }
  if (Math.abs(modificador) > MODIFICADOR_MAX) {
    return { tipo: "erro", erro: `Modificador fora da faixa (−${MODIFICADOR_MAX} a +${MODIFICADOR_MAX}).` };
  }

  return { tipo: "ok", comando: { grupos, modificador, total } };
}

/** Forma canônica do que foi pedido — só pra mensagens de erro e testes. */
export function escreverComando(c: ComandoRolagem): string {
  const dados = c.grupos.map((g) => `${g.quantidade}d${g.faces}`).join("+");
  if (c.modificador === 0) return dados;
  return dados + (c.modificador > 0 ? `+${c.modificador}` : `${c.modificador}`);
}
