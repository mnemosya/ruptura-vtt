/**
 * Fiscalização de IMAGENS no SERVIDOR (migrations 0099/0100/0101).
 *
 * O que estes casos protegem, em uma frase cada:
 *   • autorização vem da INTENÇÃO gravada na reserva, nunca de um campo
 *     que o cliente manda no finalize;
 *   • quota é serializada de verdade (duas reservas simultâneas não
 *     passam pelo mesmo saldo), e conta o TETO FÍSICO, porque a signed
 *     URL não impõe o tamanho declarado;
 *   • nada vira `ready` sem uso na mesma transação;
 *   • assinar uma URL exige que a colocação E a camada estejam visíveis;
 *   • o arquivo só some quando nenhum uso aponta para ele.
 *
 * Roda contra o banco real, com usuários autenticados de verdade — as
 * RPCs são `security definer` e as decisões dependem de `auth.uid()`.
 *
 * Uso: npx tsx scripts/dev/check-vtt-imagens-servidor.ts
 */

import { randomUUID, createHash } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadDotenv({ path: ".env.local" });
function req(n: string): string {
  const v = process.env[n];
  if (!v) { console.error(`Variável ausente: ${n}`); process.exit(1); }
  return v;
}
const admin = createClient(req("SUPABASE_URL"), req("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passou = 0, falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}
async function erroDe(p: PromiseLike<{ error: { message: string } | null }>): Promise<string | null> {
  const { error } = await p;
  return error ? error.message : null;
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const MB = 1024 * 1024;
const TETO_ARQUIVO = 10 * MB;

const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function autenticar(email: string, senha: string): Promise<SupabaseClient> {
  const anon = createClient(req("SUPABASE_URL"), req("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(error.message);
  return createClient(req("SUPABASE_URL"), req("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  });
}

async function main() {
  // ── Fixture: narrador, jogador, campanha, cena, dois tokens ──────
  const senha = randomUUID();
  const emailN = `check-img-n-${Date.now()}@ruptura.dev`;
  const emailJ = `check-img-j-${Date.now()}@ruptura.dev`;

  const { data: uN, error: eN } = await admin.auth.admin.createUser({ email: emailN, password: senha, email_confirm: true });
  if (eN) throw new Error(eN.message);
  criados.usuarios.push(uN.user.id);
  const { data: uJ, error: eJ } = await admin.auth.admin.createUser({ email: emailJ, password: senha, email_confirm: true });
  if (eJ) throw new Error(eJ.message);
  criados.usuarios.push(uJ.user.id);

  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Imagens", owner_id: uN.user.id });
  criados.campanhas.push(campaignId);
  await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: uJ.user.id, role: "player" });

  // Um fixture quebrado que devolve `null` em silêncio vira um
  // `TypeError` dez linhas adiante, longe da causa — cada insert diz
  // logo o que o banco recusou.
  const exigir = (rot: string, r: { data: { id: string } | null; error: { message: string } | null }): { id: string } => {
    if (r.error || !r.data) throw new Error(`fixture ${rot}: ${r.error?.message ?? "sem linha"}`);
    return r.data;
  };

  const cena = exigir("vtt_scenes", await admin.from("vtt_scenes")
    .insert({ campaign_id: campaignId, nome: "Cena Imagens", largura: 26, altura: 18 })
    .select("id").single());
  const sceneId = cena.id;

  // Token do jogador (via personagem controlado) e token do narrador.
  // `characters.payload` é NOT NULL sem default e `campaign_id` amarra
  // o personagem à mesa — mesmo formato mínimo dos outros checks.
  const pers = exigir("characters", await admin.from("characters")
    .insert({
      name: "PJ Imagem", status: "draft", campaign_id: campaignId, owner_id: uJ.user.id,
      payload: {
        nome: "PJ Imagem",
        atributos: { corpo: 2, mente: 2, animo: 2 },
        metadados: { schema_version: 1 },
      },
    }).select("id").single());
  const characterId = pers.id;
  // `character_controllers` é chaveado por (character_id, campaign_id, user_id).
  {
    const { error } = await admin.from("character_controllers")
      .insert({ character_id: characterId, campaign_id: campaignId, user_id: uJ.user.id });
    if (error) throw new Error(`fixture character_controllers: ${error.message}`);
  }

  const { data: tokJ } = await admin.from("vtt_tokens").insert({
    scene_id: sceneId, campaign_id: campaignId, character_id: characterId,
    nome: "PJ", sigla: "PJ", q: 2, r: 2,
  }).select("id, revision").single();
  const { data: tokN } = await admin.from("vtt_tokens").insert({
    scene_id: sceneId, campaign_id: campaignId, nome: "PN", sigla: "PN", q: 4, r: 4,
  }).select("id, revision").single();

  const narrador = await autenticar(emailN, senha);
  const jogador = await autenticar(emailJ, senha);

  const reservar = (cli: SupabaseClient, sha: string, intencao: string, tokenId: string | null = null) =>
    cli.rpc("reservar_upload_vtt_imagem", {
      p_campaign_id: campaignId, p_sha256: sha, p_intencao: intencao, p_token_id: tokenId,
    });

  // ── Autorização pela intenção ────────────────────────────────────
  {
    const e = await erroDe(reservar(jogador, hash("tile-jogador"), "tile"));
    ok("1 (jogador não reserva tile — fundo e tile são do narrador)",
      e !== null && /narrador/i.test(e), e ?? "passou indevidamente");
  }
  {
    const e = await erroDe(reservar(jogador, hash("retrato-alheio"), "retrato", tokN!.id));
    ok("2 (jogador não reserva retrato de token que não controla)",
      e !== null && /permiss/i.test(e), e ?? "passou indevidamente");
  }
  let reservaRetrato: string | null = null;
  {
    const { data, error } = await reservar(jogador, hash("retrato-proprio"), "retrato", tokJ!.id);
    reservaRetrato = (data as { reserva_id: string } | null)?.reserva_id ?? null;
    ok("3 (jogador reserva retrato do PRÓPRIO token)", !error && !!reservaRetrato, error?.message ?? `reserva ${reservaRetrato}`);
  }
  {
    const { data } = await admin.from("vtt_image_upload_reservations")
      .select("bytes_reservados").eq("id", reservaRetrato!).single();
    ok("4 (a reserva conta o TETO FÍSICO, não um tamanho declarado — a signed URL não impõe o declarado)",
      Number(data!.bytes_reservados) === TETO_ARQUIVO, `${data!.bytes_reservados} bytes`);
  }
  {
    const e = await erroDe(reservar(jogador, hash("retrato-proprio"), "retrato", tokJ!.id));
    ok("5 (o mesmo conteúdo não ganha uma segunda reserva ativa)",
      e !== null && /andamento/i.test(e), e ?? "passou indevidamente");
  }

  // ── Teto de reservas em aberto ───────────────────────────────────
  {
    await reservar(jogador, hash("r2"), "retrato", tokJ!.id);
    await reservar(jogador, hash("r3"), "retrato", tokJ!.id);
    const e = await erroDe(reservar(jogador, hash("r4"), "retrato", tokJ!.id));
    ok("6 (4ª reserva ativa do mesmo usuário é recusada — cada uma é uma capability viva)",
      e !== null && /andamento/i.test(e), e ?? "passou indevidamente");
    await admin.from("vtt_image_upload_reservations")
      .update({ estado: "cancelada" }).eq("user_id", uJ.user.id).in("sha256", [hash("r2"), hash("r3")]);
    await admin.from("vtt_campaign_storage_usage")
      .update({ bytes_reservados: TETO_ARQUIVO }).eq("campaign_id", campaignId);
  }

  // ── Finalize: a intenção é revalidada ────────────────────────────
  {
    const e = await erroDe(narrador.rpc("finalizar_upload_e_criar_imagem_cena", {
      p_reserva_id: reservaRetrato, p_bytes_reais: 1000, p_width_px: 100, p_height_px: 100,
      p_scene_id: sceneId, p_papel: "tile", p_centro_q: 1, p_centro_r: 1, p_largura_m: 5,
      p_altura_m: null, p_rotacao_graus: 0, p_opacidade: 1, p_camada: "abaixo_grade",
    }));
    ok("7 (reserva autorizada como RETRATO não pode ser finalizada como tile)",
      e !== null && /outro uso|outra pessoa/i.test(e), e ?? "passou indevidamente");
  }
  {
    const e = await erroDe(jogador.rpc("finalizar_upload_e_definir_retrato", {
      p_reserva_id: reservaRetrato, p_bytes_reais: 3 * MB, p_width_px: 512, p_height_px: 512,
      p_token_id: tokJ!.id, p_expected_revision: tokJ!.revision,
    }));
    ok("8 (retrato acima de 2 MB é recusado no servidor, não só no browser)",
      e !== null && /tamanho/i.test(e), e ?? "passou indevidamente");
  }
  {
    const e = await erroDe(jogador.rpc("finalizar_upload_e_definir_retrato", {
      p_reserva_id: reservaRetrato, p_bytes_reais: 50_000, p_width_px: 9000, p_height_px: 512,
      p_token_id: tokJ!.id, p_expected_revision: tokJ!.revision,
    }));
    ok("9 (dimensão acima de 4096 px é recusada)", e !== null && /Dimens/i.test(e), e ?? "passou indevidamente");
  }
  {
    const e = await erroDe(jogador.rpc("finalizar_upload_e_definir_retrato", {
      p_reserva_id: reservaRetrato, p_bytes_reais: 50_000, p_width_px: 512, p_height_px: 512,
      p_token_id: tokN!.id, p_expected_revision: tokN!.revision,
    }));
    ok("10 (finalize num token diferente do que autorizou a reserva é recusado)",
      e !== null && /outro token/i.test(e), e ?? "passou indevidamente");
  }

  let assetRetrato: string | null = null;
  {
    const { data, error } = await jogador.rpc("finalizar_upload_e_definir_retrato", {
      p_reserva_id: reservaRetrato, p_bytes_reais: 50_000, p_width_px: 512, p_height_px: 512,
      p_token_id: tokJ!.id, p_expected_revision: tokJ!.revision,
    });
    ok("11 (finalize legítimo do jogador passa)", !error && !!data, error?.message ?? "ok");
    const { data: tk } = await admin.from("vtt_tokens").select("retrato_image_id, revision").eq("id", tokJ!.id).single();
    assetRetrato = tk!.retrato_image_id as string | null;
    ok("12 (o token passou a apontar o arquivo)", !!assetRetrato, `${assetRetrato}`);
  }
  {
    // Idempotência: repetir não gasta revisão nem cria segundo uso.
    const { data: antes } = await admin.from("vtt_tokens").select("revision").eq("id", tokJ!.id).single();
    const { error } = await jogador.rpc("finalizar_upload_e_definir_retrato", {
      p_reserva_id: reservaRetrato, p_bytes_reais: 50_000, p_width_px: 512, p_height_px: 512,
      p_token_id: tokJ!.id, p_expected_revision: 999,
    });
    const { data: depois } = await admin.from("vtt_tokens").select("revision").eq("id", tokJ!.id).single();
    ok("13 (finalize repetido é idempotente — mesma revisão, sem segundo uso)",
      !error && antes!.revision === depois!.revision, error?.message ?? `revisão ${depois!.revision}`);
  }
  {
    const { data: uso } = await admin.from("vtt_campaign_storage_usage")
      .select("bytes_usados, bytes_reservados").eq("campaign_id", campaignId).single();
    ok("14 (o excedente do teto volta: usa-se o tamanho REAL, o resto é devolvido)",
      Number(uso!.bytes_usados) === 50_000, `usados=${uso!.bytes_usados} reservados=${uso!.bytes_reservados}`);
  }

  // ── Precedência de origem do retrato ─────────────────────────────
  {
    const { data: tk } = await admin.from("vtt_tokens").select("revision").eq("id", tokJ!.id).single();
    await jogador.rpc("set_vtt_token_portrait_url", {
      p_token_id: tokJ!.id, p_url: "https://exemplo.test/retrato.png", p_expected_revision: tk!.revision,
    });
    const { data: depois } = await admin.from("vtt_tokens")
      .select("retrato_url, retrato_image_id").eq("id", tokJ!.id).single();
    ok("15 (definir endereço LIMPA o arquivo — um retrato, uma origem)",
      depois!.retrato_url !== null && depois!.retrato_image_id === null,
      `url=${!!depois!.retrato_url} image=${depois!.retrato_image_id}`);
  }
  {
    const { data: tk } = await admin.from("vtt_tokens").select("revision").eq("id", tokJ!.id).single();
    const e = await erroDe(jogador.rpc("set_vtt_token_portrait_url", {
      p_token_id: tokJ!.id, p_url: "javascript:alert(1)", p_expected_revision: tk!.revision,
    }));
    ok("16 (`javascript:` nunca é 'uma imagem hospedada em outro lugar')",
      e !== null && /http/i.test(e), e ?? "passou indevidamente");
  }
  {
    const { data: tk } = await admin.from("vtt_tokens").select("revision").eq("id", tokJ!.id).single();
    const e = await erroDe(jogador.rpc("set_vtt_token_portrait_image", {
      p_token_id: tokN!.id, p_image_id: assetRetrato, p_expected_revision: tk!.revision,
    }));
    ok("17 (jogador não mexe no retrato de token alheio)",
      e !== null && /permiss/i.test(e), e ?? "passou indevidamente");
  }

  // ── Colocação na cena ────────────────────────────────────────────
  let fundoId: string | null = null;
  {
    const { data, error } = await narrador.rpc("criar_vtt_scene_image", {
      p_scene_id: sceneId, p_image_id: assetRetrato, p_papel: "fundo",
      p_centro_q: 0, p_centro_r: 0, p_largura_m: 26, p_altura_m: null,
      p_rotacao_graus: 0, p_opacidade: 1, p_camada: "abaixo_grade", p_reserva_id: null,
    });
    fundoId = (data as { id: string } | null)?.id ?? null;
    ok("18 (narrador coloca um fundo a partir de arquivo já existente)", !error && !!fundoId, error?.message ?? `${fundoId}`);
  }
  {
    const e = await erroDe(narrador.rpc("criar_vtt_scene_image", {
      p_scene_id: sceneId, p_image_id: assetRetrato, p_papel: "fundo",
      p_centro_q: 0, p_centro_r: 0, p_largura_m: 26, p_altura_m: null,
      p_rotacao_graus: 0, p_opacidade: 1, p_camada: "abaixo_grade", p_reserva_id: null,
    }));
    ok("19 (uma cena tem no máximo UM fundo)", e !== null && /fundo/i.test(e), e ?? "passou indevidamente");
  }
  {
    const e = await erroDe(narrador.rpc("criar_vtt_scene_image", {
      p_scene_id: sceneId, p_image_id: assetRetrato, p_papel: "tile",
      p_centro_q: 0, p_centro_r: 0, p_largura_m: 500, p_altura_m: null,
      p_rotacao_graus: 0, p_opacidade: 1, p_camada: "abaixo_grade", p_reserva_id: null,
    }));
    ok("20 (teto de 4× a cena: sangrar sim, cobrir dezesseis mapas não)",
      e !== null && /grande demais/i.test(e), e ?? "passou indevidamente");
  }
  {
    const { data: si } = await admin.from("vtt_scene_images").select("revision").eq("id", fundoId!).single();
    const e = await erroDe(narrador.rpc("mover_vtt_scene_image", {
      p_id: fundoId, p_centro_q: 1, p_centro_r: 1, p_expected_revision: (si!.revision as number) + 5,
    }));
    ok("21 (revisão desatualizada não sobrescreve em silêncio)",
      e !== null && /Revis/i.test(e), e ?? "passou indevidamente");
  }
  {
    const { data: si } = await admin.from("vtt_scene_images").select("revision").eq("id", fundoId!).single();
    const e = await erroDe(jogador.rpc("mover_vtt_scene_image", {
      p_id: fundoId, p_centro_q: 1, p_centro_r: 1, p_expected_revision: si!.revision,
    }));
    ok("22 (jogador não move imagem da cena)", e !== null && /narrador/i.test(e), e ?? "passou indevidamente");
  }

  // ── FK composta: nada cruza campanha ─────────────────────────────
  {
    const outraId = randomUUID();
    await admin.from("campaigns").insert({ id: outraId, name: "Outra", owner_id: uN.user.id });
    criados.campanhas.push(outraId);
    const { data: outraCena } = await admin.from("vtt_scenes")
      .insert({ campaign_id: outraId, nome: "Outra cena", largura: 20, altura: 20 }).select("id").single();
    const e = await erroDe(admin.from("vtt_scene_images").insert({
      scene_id: outraCena!.id, campaign_id: outraId, image_id: assetRetrato,
      papel: "tile", centro_q: 0, centro_r: 0, largura_m: 5,
    }));
    ok("23 (FK composta barra colocação apontando imagem de OUTRA campanha)",
      e !== null, e ?? "passou indevidamente");
  }

  // ── Quem pode receber uma URL assinada ───────────────────────────
  {
    const { data: narradorVe } = await admin.rpc("vtt_asset_assinavel_para", {
      p_asset_id: assetRetrato, p_user_id: uN.user.id,
    });
    const { data: jogadorVe } = await admin.rpc("vtt_asset_assinavel_para", {
      p_asset_id: assetRetrato, p_user_id: uJ.user.id,
    });
    ok("24 (narrador assina qualquer arquivo da própria campanha)", narradorVe === true, `${narradorVe}`);
    ok("25 (jogador assina o que uma colocação VISÍVEL expõe)", jogadorVe === true, `${jogadorVe}`);
  }
  {
    const { data: si } = await admin.from("vtt_scene_images").select("revision").eq("id", fundoId!).single();
    await narrador.rpc("atualizar_vtt_scene_image", {
      p_id: fundoId, p_expected_revision: si!.revision, p_largura_m: null, p_altura_m: null,
      p_rotacao_graus: null, p_opacidade: null, p_camada: null, p_z: null,
      p_visivel: false, p_travado: null, p_limpar_altura: false,
    });
    const { data: jogadorVe } = await admin.rpc("vtt_asset_assinavel_para", {
      p_asset_id: assetRetrato, p_user_id: uJ.user.id,
    });
    ok("26 (colocação escondida deixa de ser assinável pelo jogador)", jogadorVe === false, `${jogadorVe}`);
    const { data: si2 } = await admin.from("vtt_scene_images").select("revision").eq("id", fundoId!).single();
    await narrador.rpc("atualizar_vtt_scene_image", {
      p_id: fundoId, p_expected_revision: si2!.revision, p_largura_m: null, p_altura_m: null,
      p_rotacao_graus: null, p_opacidade: null, p_camada: null, p_z: null,
      p_visivel: true, p_travado: null, p_limpar_altura: false,
    });
  }
  {
    // A CAMADA inteira escondida (0093) também tira a assinatura: de
    // nada adianta esconder a camada se o arquivo segue assinável.
    await admin.from("vtt_scenes")
      .update({ camadas: { imagemFundo: { visivel: false, bloqueada: false } } }).eq("id", sceneId);
    const { data: jogadorVe } = await admin.rpc("vtt_asset_assinavel_para", {
      p_asset_id: assetRetrato, p_user_id: uJ.user.id,
    });
    ok("27 (camada escondida na cena também tira a assinatura do jogador)", jogadorVe === false, `${jogadorVe}`);
    await admin.from("vtt_scenes").update({ camadas: {} }).eq("id", sceneId);
  }

  // ── Leitura direta é impossível ──────────────────────────────────
  {
    const { data, error } = await jogador.from("vtt_image_assets").select("storage_path").limit(1);
    ok("28 (jogador NÃO lê `vtt_image_assets` direto — descobrir o caminho é descobrir o que assinar)",
      error !== null || (data ?? []).length === 0, error?.message ?? `${(data ?? []).length} linhas`);
  }

  // ── Coleta ───────────────────────────────────────────────────────
  {
    const { data: si } = await admin.from("vtt_scene_images").select("revision").eq("id", fundoId!).single();
    await narrador.rpc("excluir_vtt_scene_image", { p_id: fundoId, p_expected_revision: si!.revision });
    const { data: asset } = await admin.from("vtt_image_assets").select("estado").eq("id", assetRetrato!).single();
    ok("29 (excluir a colocação NÃO apaga o arquivo — outro uso pode apontar para ele)",
      asset!.estado === "ready", `${asset!.estado}`);

    // Sem carência: o arquivo agora não tem uso nenhum.
    const { data: coletados } = await admin.rpc("vtt_coletar_imagens_sem_uso", { p_carencia: "0 seconds" });
    const { data: depois } = await admin.from("vtt_image_assets").select("estado").eq("id", assetRetrato!).single();
    ok("30 (arquivo sem NENHUM uso é marcado para remoção — decidido por `not exists`, sem contador)",
      Array.isArray(coletados) && depois!.estado === "deleting", `${depois!.estado}`);
  }
  {
    const { data: pendentes } = await admin.rpc("vtt_imagens_pendentes_de_remocao");
    ok("31 (o que ficou marcado reaparece na próxima passada — a coleta é idempotente)",
      Array.isArray(pendentes) && pendentes.length > 0, `${(pendentes as unknown[]).length} pendente(s)`);
  }

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
}

main()
  .catch((e) => { console.error(e); falhou++; })
  .finally(async () => {
    for (const cid of criados.campanhas) {
      await admin.from("vtt_scene_images").delete().eq("campaign_id", cid);
      await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
      await admin.from("vtt_image_upload_reservations").delete().eq("campaign_id", cid);
      await admin.from("vtt_image_assets").delete().eq("campaign_id", cid);
      await admin.from("vtt_campaign_storage_usage").delete().eq("campaign_id", cid);
      await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
      await admin.from("campaigns").delete().eq("id", cid);
    }
    for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
    console.log("limpeza de fixtures concluída");
    if (falhou > 0) process.exit(1);
  });
