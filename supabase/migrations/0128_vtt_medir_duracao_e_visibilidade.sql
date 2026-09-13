-- =====================================================================
-- 0128 — Medir: DURAÇÃO e VISIBILIDADE são dois eixos, não um
--
-- O painel oferecia "Instantânea (só pra você)" ou "Permanente (fica
-- pra mesa)", colapsando duas perguntas independentes numa só. Faltavam
-- justamente as duas combinações que a mesa pede toda hora: medir uma
-- distância AO VIVO pra todo mundo ver (sem deixar régua no mapa), e
-- deixar uma régua salva que só eu enxergo.
--
--                  só pra você            pra mesa
--   instantânea    local, nada sai        broadcast ao vivo  ← nova
--   permanente     persistida, privada    persistida         ← nova (privada)
--
-- Isto reverte uma decisão explícita da 0087, e vale dizer por quê. Lá
-- está escrito: "NÃO existe `privada`. Uma medição é uma afirmação
-- sobre distância no mapa (a que todos precisam poder reagir); uma
-- régua que só o autor enxerga não teria função numa mesa." O
-- raciocínio continua verdadeiro pro caso que ele descreve — e é por
-- isso que "pra mesa" segue sendo o padrão. Só não é o único caso: o
-- narrador conferindo alcance antes de decidir o que o monstro faz, ou
-- um jogador medindo uma rota que ainda não quer anunciar, precisam
-- medir sem telegrafar. A 0087 tratou um uso legítimo como se fosse o
-- único.
--
-- PRIVADA É PRIVADA, inclusive pro narrador — diferente de `vtt_marks`,
-- onde o dono da campanha enxerga as marcações privadas alheias. A
-- diferença é deliberada: uma marcação privada é conteúdo de cena (o
-- narrador precisa poder auditar e limpar o mapa), enquanto uma régua é
-- um rascunho de raciocínio. Um rótulo que diz "só pra você" e mente
-- sobre isso é pior que não ter a opção. O narrador continua podendo
-- APAGAR qualquer régua (a policy de delete não muda): ele limpa o
-- mapa sem precisar ler o que era.
-- =====================================================================

begin;

alter table vtt_measurements
  add column if not exists privada boolean not null default false;

-- Leitura: membro da campanha lê as da mesa; a régua privada só existe
-- pra quem a criou. Sem exceção pro narrador (ver o cabeçalho).
drop policy if exists vtt_measurements_select on vtt_measurements;
create policy vtt_measurements_select on vtt_measurements
  for select to authenticated
  using (
    is_campaign_member(campaign_id)
    and (not privada or autor_id = (select auth.uid()))
  );

comment on column vtt_measurements.privada is
  'Régua salva que só o AUTOR enxerga — nem o narrador (ver migration 0128). Ele ainda pode apagá-la junto com o resto do mapa, sem nunca lê-la.';

comment on table vtt_measurements is
  'Réguas permanentes da ferramenta Medir. Guarda só os pontos axiais — distância/custo são recalculados no cliente a partir do terreno atual. Lê quem é da campanha (as privadas, só o autor); apaga o autor ou o narrador.';

-- ---------------------------------------------------------------------
-- Canal da RÉGUA AO VIVO (instantânea + pra mesa)
--
-- Efêmero de verdade: nada aqui é persistido, e é por isso que NÃO
-- passa por RPC como o ping. Um ping é um evento por gesto; uma régua
-- ao vivo é uma dezena de eventos por segundo enquanto a mão se move —
-- um round-trip de RPC por quadro seria absurdo. Então o cliente
-- publica DIRETO no canal, como já faz no canal de movimento de token
-- (migration 0070), e esta policy é o que autoriza isso: só membro da
-- campanha, só no tópico desta cena.
--
-- Mesma ressalva da 0070, e aqui ela custa ainda menos: o payload é
-- escolhido pelo cliente, então um participante mal-intencionado pode
-- publicar uma régua inventada. Uma régua não decide nada — não move
-- token, não altera cena, some sozinha. É desenho na tela dos outros,
-- pelo tempo do gesto.
--
-- MESMO REQUISITO DE IMPLANTAÇÃO da 0062/0070: "Allow public access"
-- precisa estar DESLIGADO em Realtime settings, senão `private`/RLS é
-- ignorado pra qualquer canal.
-- ---------------------------------------------------------------------
drop policy if exists "campaign_members_use_regua_channel" on "realtime"."messages";
create policy "campaign_members_use_regua_channel"
on "realtime"."messages"
for all
to authenticated
using (
  is_campaign_member(
    (regexp_match(realtime.topic(), '^campaign:([0-9a-fA-F-]{36}):scene:[0-9a-fA-F-]{36}:vtt:regua$'))[1]::uuid
  )
)
with check (
  is_campaign_member(
    (regexp_match(realtime.topic(), '^campaign:([0-9a-fA-F-]{36}):scene:[0-9a-fA-F-]{36}:vtt:regua$'))[1]::uuid
  )
);

commit;
