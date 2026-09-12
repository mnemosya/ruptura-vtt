-- =====================================================================
-- 0098 — Marcações ganham TIPO DE SINAL e DURAÇÃO
--
-- A ferramenta Marcar gravava tudo fixo (`cor: 'ciano'`, sem rótulo,
-- nunca privada) porque não havia janela pra escolher. A janela agora
-- existe, e com ela duas coisas que a tabela não modelava:
--
--   · `sinal` — o que a marcação SIGNIFICA: alvo, perigo, rota ou nota.
--     Não confundir com `tipo`, que é a GEOMETRIA (linha/seta/desenho/
--     texto) e continua sendo 'texto' pro gesto de um clique. Duas
--     coisas diferentes, duas colunas.
--   · `duracao` — por quanto tempo a marcação fica. Enforced de
--     verdade: 'rodada' some quando a rodada vira, 'combate' quando as
--     rodadas encerram. `rodada_criada` é o que permite comparar.
--
-- Nada aqui muda quem VÊ o quê: `privada` continua sendo a regra de
-- visibilidade, e as policies da 0065 seguem intactas.
-- =====================================================================

begin;

alter table vtt_marks
  add column if not exists sinal text not null default 'alvo',
  add column if not exists duracao text not null default 'persistente',
  add column if not exists rodada_criada integer;

alter table vtt_marks drop constraint if exists vtt_marks_sinal_ck;
alter table vtt_marks
  add constraint vtt_marks_sinal_ck check (sinal in ('alvo', 'perigo', 'rota', 'nota'));

alter table vtt_marks drop constraint if exists vtt_marks_duracao_ck;
alter table vtt_marks
  add constraint vtt_marks_duracao_ck check (duracao in ('persistente', 'rodada', 'combate'));

-- ---------------------------------------------------------------------
-- Expiração — roda no servidor, junto da trilha, pra que a marcação
-- suma pra TODO MUNDO no mesmo instante. Filtrar no cliente deixaria
-- cada participante com uma tela diferente.
-- ---------------------------------------------------------------------
create or replace function public.expirar_marcas_da_cena(
  p_scene_id uuid,
  p_rodada_atual integer,
  p_combate_encerrado boolean
) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_campaign uuid;
  v_removidas integer;
begin
  select campaign_id into v_campaign from public.vtt_scenes where id = p_scene_id;
  if v_campaign is null then return 0; end if;
  -- Qualquer participante da campanha pode disparar: quem avança a
  -- rodada é quem está conduzindo, e a limpeza é consequência da
  -- transição, não um poder à parte.
  if not public.is_campaign_member(v_campaign, auth.uid()) then
    raise exception 'Sem acesso a esta cena.' using errcode = '42501';
  end if;

  delete from public.vtt_marks
   where scene_id = p_scene_id
     and (
       (duracao = 'rodada' and (rodada_criada is null or rodada_criada < p_rodada_atual))
       or (duracao = 'combate' and p_combate_encerrado)
     );
  get diagnostics v_removidas = row_count;
  return v_removidas;
end;
$$;

revoke all on function public.expirar_marcas_da_cena(uuid, integer, boolean) from public, anon;
grant execute on function public.expirar_marcas_da_cena(uuid, integer, boolean) to authenticated;

commit;
