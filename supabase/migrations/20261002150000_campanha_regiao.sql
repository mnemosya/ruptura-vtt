-- Região onde a campanha começa (v1.2).
--
-- Usada pela Forja de Refratário (segundo idioma do personagem, já sem
-- perguntar) e pela área autenticada (arte do cartão da campanha).
-- Opcional: campanhas antigas ficam sem região e a Forja continua
-- perguntando. A escrita segue a RLS `campaigns_owner_update`: só o dono.
alter table public.campaigns
  add column if not exists regiao text
  check (regiao is null or regiao in ('beldran', 'kravus', 'talesh', 'torvash', 'vastra'));

comment on column public.campaigns.regiao is
  'Região v1.2 onde a campanha começa (REGIOES_V12). Null = não definida.';
