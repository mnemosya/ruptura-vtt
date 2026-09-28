/**
 * Contas de fixture para checks TRANSACIONAIS — criadas dentro da
 * própria transação, e desfeitas com ela.
 *
 * ── Por que isto existe ──────────────────────────────────────────────
 *
 * Os checks transacionais pegavam contas EMPRESTADAS do banco
 * (`select id from auth.users limit 4`). Parecia inofensivo: a
 * transação reverte tudo, e as contas nem são tocadas.
 *
 * Não é inofensivo. Aquelas contas têm história — pertencem a campanhas,
 * participam de mesas, têm preferências. Um teste que afirma "quem não é
 * da campanha não vê nada" pode pegar justamente a conta que é dona de
 * outra campanha com conteúdo, e passar ou falhar por motivo alheio ao
 * que verifica. Pior: o resultado muda conforme o conteúdo do banco,
 * então o mesmo check passa hoje e falha amanhã sem que nada no código
 * tenha mudado — foi exatamente o que aconteceu depois de uma varredura
 * de resíduo mudar o conjunto das primeiras contas.
 *
 * Criadas aqui, as contas nascem limpas: sem campanha, sem vínculo, sem
 * preferência. É a única forma de "uma conta de fora" significar de fato
 * uma conta de fora.
 *
 * `auth.users` é tabela comum para quem tem conexão direta; o insert
 * participa da transação e some no `rollback`, como qualquer outro.
 */

import { randomUUID } from "node:crypto";

/** O `instance_id` que o GoTrue usa em projetos de instância única. */
const INSTANCIA = "00000000-0000-0000-0000-000000000000";

/**
 * Cria `quantidade` contas limpas e devolve os ids.
 * @param {import('pg').Client} db
 * @param {number} quantidade
 * @param {string} [prefixo] aparece no e-mail, para achar no log
 */
export async function criarContasDeFixture(db, quantidade, prefixo = "fx") {
  const ids = [];
  for (let i = 0; i < quantidade; i++) {
    const id = randomUUID();
    await db.query(
      `insert into auth.users (id, email, aud, role, instance_id)
       values ($1, $2, 'authenticated', 'authenticated', $3)`,
      [id, `${prefixo}-${i}-${id.slice(0, 8)}@ruptura.dev`, INSTANCIA],
    );
    ids.push(id);
  }
  return ids;
}
