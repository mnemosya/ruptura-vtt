-- Marcações do Calendário Imperial passam a ser editáveis (título, tipo e
-- quem vê) pelo mesmo critério de quem pode apagar: o autor, ou o dono da
-- campanha quando a marcação não é privada.
begin;

grant update (kind, title, visibility) on public.vtt_calendar_marks to authenticated;

create policy vtt_calendar_marks_update on public.vtt_calendar_marks for update to authenticated
  using (author_id = auth.uid() or (visibility <> 'privada' and public.is_campaign_owner(campaign_id)))
  with check (author_id = auth.uid() or (visibility <> 'privada' and public.is_campaign_owner(campaign_id)));

commit;
