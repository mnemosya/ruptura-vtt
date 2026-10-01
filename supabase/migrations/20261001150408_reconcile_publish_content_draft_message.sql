-- Reconcilia a única diferença remanescente entre o replay histórico e
-- o banco remoto. A versão viva já usa "<>" na mensagem de conflito,
-- enquanto uma redefinição posterior no histórico voltou a usar "≠".
--
-- A troca não altera a regra nem o SQLSTATE e é idempotente: no remoto
-- atual, onde a mensagem já está reconciliada, esta migration é um no-op.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.publish_content_draft(uuid,integer,jsonb,text,jsonb,jsonb,text)'::regprocedure
  ) into v_definition;

  if position('≠' in v_definition) > 0 then
    execute replace(v_definition, '≠', '<>');
  end if;
end
$$;
