"use client";
import { useState } from "react";
import { BandoTab } from "../../mesas/[campaignId]/vtt/_painel/BandoTab";
import { newCrewStateV12 } from "../../../lib/rulesetV12";
import type { CatalogoBandoPainel } from "../../mesas/[campaignId]/vtt/_painel/acoes/bandoFichaPainel";
import catalogo from "../../../../content/v12/db_bando_v1_2.json";
const ficha = { catalogo: catalogo as unknown as CatalogoBandoPainel, registro: { revision: 1, state: { ...newCrewStateV12({ nome: "Bando de teste", principio: "Prévia local dos componentes reais.", simbolo: "", contato_inicial: "", inimigo_ou_divida: "" }), cobalto: 7, caixa: 650, exposicao_pistas: [{ origem: "Registro de teste na rota do refúgio", registrada_em: "2026-10-20" }] } }, personagens: [] };
const inventario = { podeAdministrar: true, itens: [{ id: "teste", nome: "Equipamento de teste", slug: null, categoria: "equipamento", subtipo: null, quantidade: 3, payload: { id: "teste", itemSlug: "teste", itemNome: "Equipamento de teste", categoria: "equipamento", quantidade: 3, estado: "mochila" as const, adquiridoEm: "2026-10-20" } }] };
export function PreviewBando() { const [largo, setLargo] = useState(false); return <main style={{ minHeight: "100vh", background: "#030b12", padding: 20, color: "#b8d8e8" }}><p>Prévia de desenvolvimento · dados de teste · alterações apenas locais</p><button onClick={() => setLargo(!largo)}>Alternar largura</button><div className="rv-painel" style={{ position: "relative", width: largo ? 620 : 390, maxWidth: "100%", height: 760, display: "flex", marginTop: 16 }}><BandoTab campaignId="preview" visivel recarregarSinal={0} onEnviarParaPersonagem={() => { }} fixtureVisual={inventario} fichaVisual={ficha}/></div></main>; }
