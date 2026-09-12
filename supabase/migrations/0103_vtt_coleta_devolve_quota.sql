-- =====================================================================
-- 0103 — A coleta devolve a quota
--
-- `vtt_confirmar_remocao_imagem` (0101) fazia UMA coisa: apagar a linha
-- do asset depois que o objeto saiu do Storage. Não tocava em
-- `vtt_campaign_storage_usage`.
--
-- O efeito é um vazamento silencioso e permanente. Cada upload soma em
-- `bytes_usados` no finalize; nada subtrai quando o arquivo é recolhido.
-- Uma campanha que sobe e descarta mapas até bater 1 GB fica travada
-- com o bucket VAZIO — e o sintoma ("acabou o espaço") não aponta pra
-- lugar nenhum, porque não há nada armazenado para apagar.
--
-- Encontrado rodando o ciclo inteiro na mesa: colar → colocar → remover
-- → `gc:vtt-imagens`. O arquivo saiu do bucket e da tabela; a quota
-- ficou em 3412 bytes de nada.
--
-- ── POR QUE AQUI, E NÃO NO SCRIPT ───────────────────────────────────
-- A devolução tem que ser ATÔMICA com a remoção da linha. Se o script
-- fizesse as duas chamadas, uma falha entre elas deixaria o pior dos
-- dois mundos: asset apagado e quota presa, sem nenhuma linha restante
-- que dissesse quanto devolver. Dentro da função, ou as duas acontecem
-- ou nenhuma.
--
-- A subtração é travada (`for update`) pela mesma razão que a reserva:
-- essa linha é o ponto de serialização da quota, e uma coleta
-- concorrente com um upload leria um saldo velho.
-- =====================================================================

begin;

create or replace function vtt_confirmar_remocao_imagem(p_storage_path text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asset vtt_image_assets;
begin
  -- Trava o asset antes de ler os bytes: sem isso, duas passadas da
  -- coleta sobre o mesmo caminho poderiam descontar duas vezes.
  select * into v_asset
  from vtt_image_assets
  where storage_path = p_storage_path and estado = 'deleting'
  for update;

  -- Nada a fazer é um resultado VÁLIDO, não um erro: a coleta é
  -- idempotente por contrato, e rodar de novo sobre o que já foi
  -- recolhido tem que ser inofensivo.
  if v_asset.id is null then
    return;
  end if;

  update vtt_campaign_storage_usage
     -- `greatest(0, …)`: a quota é um contador, e contador acumula
     -- desvio. Se algum dia ele estiver menor que o arquivo que sai,
     -- o certo é parar no zero — uma quota NEGATIVA daria espaço
     -- infinito de graça, que é a falha mais cara das duas.
     set bytes_usados = greatest(0, bytes_usados - v_asset.bytes),
         updated_at = now()
   where campaign_id = v_asset.campaign_id;

  delete from vtt_image_assets where id = v_asset.id;
end;
$$;

revoke all on function vtt_confirmar_remocao_imagem(text) from public, anon, authenticated;
grant execute on function vtt_confirmar_remocao_imagem(text) to service_role;

-- ── Conserto do que já vazou ────────────────────────────────────────
-- Recalcula o uso a partir dos arquivos que REALMENTE existem. Roda uma
-- vez; daqui pra frente a função acima mantém a conta em dia.
update vtt_campaign_storage_usage u
   set bytes_usados = coalesce((
         select sum(a.bytes) from vtt_image_assets a
         where a.campaign_id = u.campaign_id and a.estado <> 'deleting'
       ), 0),
       updated_at = now();

commit;
