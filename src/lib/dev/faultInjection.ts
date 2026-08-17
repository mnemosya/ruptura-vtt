/**
 * Seam ÚNICA de injeção de falha de leitura, para testes de estado de
 * erro (auditoria da Fase 5). Irmã de `guard.ts`, mesmo princípio de
 * gating por ambiente.
 *
 * Por que existir: as leituras de servidor rodam no processo Node, não
 * passam pela rede do browser — `page.route` do Playwright não as
 * alcança. As alternativas tentadas antes eram piores:
 *   - gate temporário dentro da própria página (Fase 4): funciona, mas
 *     deixa código de teste no caminho de produção até alguém lembrar
 *     de reverter à mão;
 *   - revogar o GRANT da tabela no banco: falha REAL, porém DDL GLOBAL
 *     — afeta todo usuário e toda página que usa a tabela, não
 *     sobrevive a `SIGKILL`/queda de conexão/duas suítes concorrentes,
 *     e o "restaurar" era um `GRANT` fixo que não preserva o privilégio
 *     anterior. Não pertence a uma suíte comum de regressão.
 *
 * Três travas independentes, todas necessárias para a falha disparar:
 *   1. `NODE_ENV === "production"` → no-op incondicional;
 *   2. `DEV_FAULT_INJECTION_SECRET` ausente do ambiente → no-op (ou
 *      seja: mesmo em dev, quem não configurou não tem seam ligada);
 *   3. a requisição precisa trazer o segredo E o nome do recurso nos
 *      headers — comparação de tempo constante no segredo.
 *
 * O escopo é a REQUISIÇÃO, não o processo nem o banco: dois testes em
 * paralelo não interferem um no outro, nada precisa ser "restaurado", e
 * um processo morto no meio não deixa resíduo nenhum.
 *
 * `import "server-only"` — nunca pode ser puxado por um Client
 * Component. Não é defesa contra o cenário que este arquivo existe
 * para evitar (isso já é feito pelas 3 travas acima), é defesa contra
 * ESTE módulo em si vazar pro bundle do cliente por um import
 * acidental futuro: `next/headers` já falharia a build fora de um
 * Server Component, mas o erro do `server-only` é mais direto sobre a
 * causa.
 */

import "server-only";
import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";

const HEADER_RECURSO = "x-ruptura-falha-recurso";
const HEADER_SEGREDO = "x-ruptura-falha-segredo";

function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Envolve uma leitura de servidor. Em produção (ou sem a seam
 * configurada) é literalmente `await ler()` — nenhum comportamento
 * novo, nenhum custo além de uma checagem de env.
 *
 * `recurso` é o rótulo que o teste pede para falhar (ex.: "livro",
 * "convites"). Falhar UM recurso e não os outros é o que permite provar
 * que o erro é tratado POR RECURSO, e não derrubando a página inteira.
 */
export async function comFalhaInjetavel<T>(recurso: string, ler: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV === "production") return ler();

  const segredo = process.env.DEV_FAULT_INJECTION_SECRET;
  if (!segredo) return ler();

  const cabecalhos = await headers();
  if (!segredoConfere(cabecalhos.get(HEADER_SEGREDO), segredo)) return ler();
  if (cabecalhos.get(HEADER_RECURSO) !== recurso) return ler();

  throw new Error(`[injeção de falha de teste] leitura de "${recurso}" falhou propositalmente`);
}
