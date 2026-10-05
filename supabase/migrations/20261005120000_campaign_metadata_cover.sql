-- CAMP-01: a capa usa um bucket privado próprio; imagens de cena têm
-- permissões, cotas e ciclo de vida incompatíveis com metadados da campanha.
alter table public.campaigns
  add column description text,
  add column cover_path text,
  add column initial_ranking text not null default 'F',
  add constraint campaigns_description_length check (description is null or char_length(description) <= 1000),
  add constraint campaigns_cover_path_shape check (cover_path is null or cover_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.webp$')),
  add constraint campaigns_initial_ranking_valid check (initial_ranking in ('F', 'E', 'D', 'C', 'B', 'A', 'S', 'S+'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign-covers', 'campaign-covers', false, 5242880, array['image/webp'])
on conflict (id) do nothing;

-- Sem policies em storage.objects: leitura e escrita passam pelo servidor
-- depois da autorização na linha de campaigns.
-- Reversão: executar gc:campaign-covers após remover referências,
-- esvaziar/excluir o bucket e então remover as duas colunas de campaigns.
