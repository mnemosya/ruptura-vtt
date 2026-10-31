"use client";

import { useEffect, useMemo, useState } from "react";
import type { Character, ItemContent } from "../../../../../../lib/character";
import { normalizeCharacter } from "../../../../../../lib/character";
import { resumoDeCarga } from "../../../../../../lib/character/carga";
import { ARS_CONTENT_ID, type ArsRegiao } from "../../../../../../lib/character/escalpos";
import { catalogWithMarketEscalpos } from "../../../../../../lib/character/marketEscalpos";
import { JanelaMercado as JanelaMercadoConsole } from "../../../../../ficha/_console/panels/hud/JanelaMercado";
import { MercadoHud } from "../../../../../ficha/_console/panels/hud/MercadoHud";
import { produtoDoModelo } from "../../../../../ficha/_console/panels/InventarioPanel";
import type { TermoDeRegra } from "../../../../../ficha/_console/types";
import { abrirConsoleAction, carregarCatalogosConsoleAction, comprarNoMercadoAction } from "../acoes/consolePainel";
import { listarPersonagensDaMesaAction, type PersonagemDaMesa } from "../../_acoes/campanhaActions";

export function JanelaMercado({ campaignId, ehNarrador, onFechar }: {
  campaignId: string;
  ehNarrador: boolean;
  onFechar: () => void;
}) {
  const [personagens, setPersonagens] = useState<PersonagemDaMesa[]>([]);
  const [catalogo, setCatalogo] = useState<Map<string, ItemContent> | null>(null);
  const [propriedades, setPropriedades] = useState<TermoDeRegra[]>([]);
  const [glossario, setGlossario] = useState<TermoDeRegra[]>([]);
  const [compradorId, setCompradorId] = useState("");
  const [personagem, setPersonagem] = useState<Character | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroCompra, setErroCompra] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    void Promise.all([listarPersonagensDaMesaAction(campaignId), carregarCatalogosConsoleAction(campaignId)])
      .then(([pessoas, dados]) => {
        if (!vivo) return;
        if (!pessoas.ok) setErro(pessoas.erro ?? "Falha ao listar os personagens.");
        else setPersonagens(pessoas.dados ?? []);
        if (!dados.ok || !dados.dados || dados.dados.itemsError || dados.dados.escalposError) {
          setErro(dados.erro ?? dados.dados?.itemsError ?? dados.dados?.escalposError ?? "Falha ao carregar o Mercado.");
        } else {
          setCatalogo(catalogWithMarketEscalpos(dados.dados.items, dados.dados.escalpos));
          setPropriedades(dados.dados.properties.map(p => ({
            tipo: "propriedade", slug: p.slug, nome: p.nome,
            descricao: p.descricaoCurta?.trim() || p.descricaoLonga?.trim() || null,
          })));
          setGlossario([
            ...dados.dados.combatActions.map(a => ({ tipo: "acao" as const, slug: a.slug, nome: a.nome, descricao: a.descricao_curta ?? a.descricao_longa ?? null })),
            ...dados.dados.condicoesDisponiveis.map(c => ({ tipo: "condicao" as const, slug: c.slug, nome: c.nome, descricao: c.descricao_curta ?? null })),
          ]);
        }
      })
      .catch(() => { if (vivo) setErro("Falha ao carregar o Mercado."); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [campaignId]);

  useEffect(() => {
    if (!compradorId) return;
    let vivo = true;
    void abrirConsoleAction(campaignId, compradorId).then(r => {
      if (!vivo) return;
      if (!r.ok || !r.dados) setErroCompra(r.erro ?? "Falha ao carregar o comprador.");
      else setPersonagem(normalizeCharacter(r.dados.personagem.payload));
    }).catch(() => { if (vivo) setErroCompra("Falha ao carregar o comprador."); });
    return () => { vivo = false; };
  }, [campaignId, compradorId]);

  const produtos = useMemo(() => {
    if (!catalogo) return [];
    const api = { catalogo, glossario, propriedadesCatalogo: propriedades };
    return [...catalogo.values()].filter(m => (m.preco ?? 0) > 0).map(m => produtoDoModelo(api, m));
  }, [catalogo, glossario, propriedades]);
  const carga = personagem && catalogo ? resumoDeCarga(personagem, catalogo) : null;
  const saldo = personagem ? personagem.carteira?.aretz_informal ?? 0 : null;
  const regioesArs = (personagem?.escalpos_instalados ?? []).filter(i => i.contentId === ARS_CONTENT_ID && i.regiaoArs).map(i => i.regiaoArs!);

  const comprar = async (slug: string, quantidade: number, precoUnitario: number, regiaoArs?: ArsRegiao): Promise<boolean> => {
    if (!compradorId || !personagem) return false;
    setErroCompra(null);
    try {
      const resultado = await comprarNoMercadoAction(campaignId, compradorId, slug, quantidade, precoUnitario, regiaoArs);
      if (!resultado.ok || !resultado.dados) {
        setErroCompra(resultado.erro ?? "Compra não realizada.");
        return false;
      }
      setPersonagem(normalizeCharacter(resultado.dados.payload));
      return true;
    } catch {
      setErroCompra("Falha ao concluir a compra.");
      return false;
    }
  };

  return <JanelaMercadoConsole onFechar={onFechar}>
    {fechar => <>
      <MercadoHud
        produtos={produtos}
        saldo={saldo}
        usados={carga?.ocupados ?? 0}
        capacidade={carga?.capacidade ?? 0}
        comprador={{ id: compradorId, opcoes: personagens, onChange: id => { setCompradorId(id); setPersonagem(null); setErroCompra(null); } }}
        arsRegioesInstaladas={regioesArs}
        onComprar={comprar}
        onFechar={fechar}
        erroCompra={erroCompra}
      />
      {(carregando || erro || (!carregando && personagens.length === 0)) && <div role={erro ? "alert" : "status"} style={{ position: "absolute", top: 75, left: "50%", transform: "translateX(-50%)", zIndex: 5, padding: "10px 16px", background: "#081925", border: "1px solid #ff8a1f", color: "#e8f5ff", fontSize: 13, maxWidth: "90%", textAlign: "center" }}>
        {erro ?? (carregando ? "Carregando Mercado…" : ehNarrador ? "Nenhum personagem nesta campanha ainda. O catálogo pode ser consultado." : "Você ainda não controla um personagem nesta campanha. O catálogo pode ser consultado.")}
      </div>}
    </>}
  </JanelaMercadoConsole>;
}
