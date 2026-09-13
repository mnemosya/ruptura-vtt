-- =====================================================================
-- 0120 — `is_character_controller(uuid)` deixa de ser executável por anon
--
-- A 0051 escreveu a intenção com todas as letras:
--
--     revoke all on function is_character_controller(uuid) from public;
--     grant execute on function is_character_controller(uuid) to authenticated;
--
-- "Só quem está autenticado." Só que isso não é o que acontece num banco
-- novo. As *default privileges* do Supabase concedem EXECUTE a `anon`,
-- `authenticated` e `service_role` em toda função criada no schema
-- `public` — e essa concessão é EXPLÍCITA, nominal. `revoke … from
-- public` remove a herança de PUBLIC e não encosta num grant nominal.
-- Resultado: a função nasce com `anon=X` na ACL, e as duas linhas acima
-- não bastam para o que dizem.
--
-- Em produção `anon` não tem o grant — em algum momento ele saiu de lá.
-- Quem estava errado era o Git: replayar as migrations num banco limpo
-- reintroduzia o acesso que a 0051 queria negar.
--
-- Encontrado pela comparação de catálogo do replay
-- (`db:verificar-replay`), que confronta a ACL dos dois bancos. Nenhum
-- dos verificadores mais baratos enxerga isto: o de drift compara CORPO
-- de função, e corpo aqui é idêntico.
--
-- ── Severidade, sem exagero ──────────────────────────────────────────
--
-- Baixa, e vale dizer para que ninguém leia esta migration como um
-- vazamento tapado: a função é `security definer` e decide tudo a
-- partir de `auth.uid()`. Para um chamador anônimo `auth.uid()` é nulo,
-- então `is_character_controller_for(…, null)` é falso e a resposta é
-- sempre `false`. O que se corrige aqui é a distância entre o que a
-- 0051 declara e o que ela entrega — não uma porta aberta.
--
-- ── Só `anon` ────────────────────────────────────────────────────────
--
-- `service_role` continua com o grant, porque produção o tem. Revogar
-- "por simetria" criaria uma divergência NOVA em nome da limpeza, que é
-- o oposto do que esta migration existe para fazer.
-- =====================================================================

begin;

revoke all on function public.is_character_controller(uuid) from anon;

commit;
