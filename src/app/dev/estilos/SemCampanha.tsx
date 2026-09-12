"use client";

/**
 * Aviso para as três peças que são SUPERFÍCIE DE INTEGRAÇÃO.
 *
 * A galeria monta tudo com estado fabricado, menos estas: elas não são
 * uma peça, são a composição de várias, e leem autorização do servidor.
 * Montá-las sem campanha não mostrava a peça — mostrava "Você não tem
 * acesso a esta campanha", uma falha de AUTORIZAÇÃO com cara de estado
 * de design. Exemplo falso numa galeria é pior que buraco: o buraco
 * ninguém aprova por engano.
 *
 * E não vale semear uma campanha de mentira só por elas: as três já têm
 * onde ser vistas de verdade (o harness próprio, que monta o componente
 * REAL com uma campanha REAL), e o que elas têm de visual próprio já
 * está isolado em outras abas desta mesma galeria. Por isso o aviso
 * aponta o caminho em vez de inventar um.
 */
export function SemCampanha({ peca, jaExisteEm, oQueTemAqui }: {
  peca: string;
  /** Harness que já monta esta peça com campanha real. */
  jaExisteEm: string;
  /** Onde, nesta galeria, o visual próprio dela já está isolado. */
  oQueTemAqui: string;
}) {
  return (
    <div className="gal-sem-campanha">
      <strong>Precisa de uma mesa de verdade</strong>
      <p>
        {peca} não é uma peça só — ela monta várias por dentro e lê autorização do servidor. Sem
        uma campanha real, o que apareceria aqui seria o erro de acesso, não a tela.
      </p>

      <p className="gal-sem-campanha-rotulo">Para ver com dados reais</p>
      <code>{jaExisteEm}</code>
      <code>/dev/estilos?campaignId=&lt;uuid&gt;</code>

      <p className="gal-sem-campanha-nota">
        O visual próprio dela já está nesta galeria: {oQueTemAqui}.
      </p>
    </div>
  );
}
