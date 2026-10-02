-- RUPTURA v1.2: entidades estruturais do novo domínio de personagem.
--
-- Características de Classe/Subclasse permanecem dentro dos respectivos
-- documentos: elas não precisam de identidade global fora da progressão da
-- entidade que as concede. Isso evita um content_type extra sem consumidor.

alter type public.content_type add value if not exists 'class';
alter type public.content_type add value if not exists 'subclass';
alter type public.content_type add value if not exists 'background';
alter type public.content_type add value if not exists 'quality';
alter type public.content_type add value if not exists 'complication';
