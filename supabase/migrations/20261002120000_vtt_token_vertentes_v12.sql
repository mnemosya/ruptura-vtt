-- Vertentes do token com os nomes da v1.2.
--
-- "Somática" não existe mais: Biótica é a substituição direta. Cognitiva e
-- Energética passam a concordar com "a Vertente". O app já entende os nomes
-- antigos (`VERTENTES_LEGADAS` em `tokenApresentacao.ts`) e passa a gravar só
-- os novos; isto regrava os tokens que já existem nas mesas.
--
-- Só `vtt_tokens.vertente`. Magias (`payload.vertente` de conteúdo `spell`)
-- ficam de fora até o capítulo de magias ser normalizado, e `tipo_dano`
-- "energetico" é tipo de dano, não Vertente: não é tocado.
--
-- Idempotente: rodar de novo não encontra mais nada para trocar.
-- `revision` não muda de propósito: a cor é a mesma, nenhum cliente precisa
-- descartar edição em andamento por causa disto.

update public.vtt_tokens
   set vertente = case vertente
                    when 'somatico'   then 'biotica'
                    when 'somatica'   then 'biotica'
                    when 'cognitivo'  then 'cognitiva'
                    when 'energetico' then 'energetica'
                  end
 where vertente in ('somatico', 'somatica', 'cognitivo', 'energetico');
