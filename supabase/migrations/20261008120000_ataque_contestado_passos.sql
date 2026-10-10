-- =====================================================================
-- Ataque contestado na mesa (`vtt/_painel/acoes/ataquePainel.ts`).
--
-- Cada passo do ataque grava uma trava em `campaign_workflow_steps`
-- (única por workflow + passo) para dois cliques não resolverem duas
-- vezes. Até aqui só o narrador inseria (a trava de "aplicar_dano").
-- Agora dois passos são de JOGADOR:
--
--   · "defesa"      — quem controla o alvo rola a defesa;
--   · "dano_rolado" — quem atacou escolhe a região e rola o dano.
--
-- A policy nova libera a inserção desses dois passos para membros da
-- campanha. Quem pode agir POR QUAL personagem continua sendo
-- conferido na ação do servidor (controle do alvo / do atacante); a
-- trava só impede o passo de acontecer duas vezes. "aplicar_dano"
-- segue só do narrador.
-- =====================================================================

begin;

drop policy if exists campaign_workflow_steps_member_insert_ataque on public.campaign_workflow_steps;
create policy campaign_workflow_steps_member_insert_ataque on public.campaign_workflow_steps
  for insert
  to authenticated
  with check (
    is_campaign_member(campaign_id)
    and step in ('defesa', 'dano_rolado')
  );

commit;
