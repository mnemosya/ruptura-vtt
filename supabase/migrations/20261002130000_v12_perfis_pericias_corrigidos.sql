-- Perfis de Perícias iguais em todas as Classes v1.2.
--
-- Âncora, Combatente, Face e Técnico foram transcritas com perfis
-- diferentes das demais (10·4·1, 7·3·2, 3·2·3). O correto, para todas, é:
--   Abrangente     8 × valor 1, 5 × valor 2, 1 × valor 3  (21 pontos)
--   Padrão         5 × valor 1, 4 × valor 2, 2 × valor 3  (19 pontos)
--   Especializado  4 × valor 1, 2 × valor 2, 3 × valor 3  (17 pontos)
-- O conteúdo versionado (`content/v12/db_classe_*`) foi corrigido junto.
--
-- Mexe só no documento publicado e registra a troca no changelog, como uma
-- publicação do editor. Personagens já criados não são alterados.
-- Idempotente: classes que já estão certas não mudam nem geram registro.

do $$
declare
  v_certo jsonb := '[
    {"nome": "Abrangente", "slug": "abrangente", "quantidades": {"valor_1": 8, "valor_2": 5, "valor_3": 1}},
    {"nome": "Padrão", "slug": "padrao", "quantidades": {"valor_1": 5, "valor_2": 4, "valor_3": 2}},
    {"nome": "Especializado", "slug": "especializado", "quantidades": {"valor_1": 4, "valor_2": 2, "valor_3": 3}}
  ]'::jsonb;
  r record;
  v_novo jsonb;
  v_hash text;
begin
  for r in
    select * from public.content_documents
     where content_type = 'class' and status = 'published'
       and payload->'criacao'->'perfis_pericias' is distinct from v_certo
  loop
    v_novo := jsonb_set(r.payload, '{criacao,perfis_pericias}', v_certo);
    v_hash := encode(extensions.digest(v_novo::text, 'sha256'), 'hex');
    update public.content_documents
       set payload = v_novo, payload_hash = v_hash, updated_at = now()
     where id = r.id;
    insert into public.content_changelog (
      document_id, content_type, change_type, pack_id,
      payload_before, payload_after, version_before, version_after,
      summary, author_email, changed_paths, payload_hash_before, payload_hash_after
    ) values (
      r.id, r.content_type, 'updated', 'migration',
      r.payload, v_novo, r.version, r.version,
      'Perfis de Perícias corrigidos para os valores comuns a todas as Classes (8·5·1, 5·4·2, 4·2·3).',
      'migration:20261002130000', '["criacao.perfis_pericias"]'::jsonb, r.payload_hash, v_hash
    );
  end loop;
end $$;
