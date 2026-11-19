"use client";

/**
 * BANCADA — fora do desenho das propostas, de propósito com outra cara
 * (cinza, mono, tracejada). Controla o personagem e o conduto, força os
 * dados, simula quem observa e mede os tempos. Recolhível.
 */

import Link from "next/link";
import { useState } from "react";
import { custoDaTroca, LIMITE_INICIAL, LIMITE_MAXIMO, ordinal, ordinalF } from "./regra";
import { CENARIOS, trocada, useProto } from "./estado";

function Numero({ rotulo, valor, min, max, onChange, testId }: {
  rotulo: string; valor: number; min: number; max: number; onChange: (n: number) => void; testId?: string;
}) {
  return (
    <div className="rp-b-num">
      <span>{rotulo}</span>
      <span className="rp-b-num-ctl">
        <button type="button" aria-label={`Diminuir ${rotulo}`} disabled={valor <= min} onClick={() => onChange(Math.max(min, valor - 1))}>−</button>
        <output data-testid={testId} aria-live="polite">{valor}</output>
        <button type="button" aria-label={`Aumentar ${rotulo}`} disabled={valor >= max} onClick={() => onChange(Math.min(max, valor + 1))}>+</button>
      </span>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rp-b-secao">
      <h3>{titulo}</h3>
      {children}
    </section>
  );
}

export function Bancada() {
  const s = useProto();
  const [aberta, setAberta] = useState(true);
  const c = s.conduto;
  const prox = custoDaTroca(c);
  const proxTexto = prox.faixa === "abaixo"
    ? `abaixo do limite · +1 Sobrecarga (${prox.sobrecargaDepois}/${c.limite})`
    : prox.faixa === "alcanca"
      ? `alcança o limite · ${ordinalF(prox.ruptura)} Ruptura, Integridade −${prox.perdaIntegridade}${prox.ultimaVontade ? " · Última Vontade" : ""}`
      : `ultrapassa · ${ordinal(prox.excedente)} excedente, ${prox.d4}d4 de Integridade${prox.ultimaVontade === "certa" ? " · Última Vontade" : prox.ultimaVontade === "pode" ? ` · zera com ${prox.perdaQueZera}+` : ""}`;
  const tm = s.telemetria;
  const ms = (v: number | null) => (v == null ? "—" : `${v} ms`);
  const ultima = s.rolagens.filter((r) => r.fase === "completa").at(-1) ?? null;

  if (!aberta) {
    return (
      <aside className="rp-bancada is-fechada" aria-label="Bancada de teste">
        <button type="button" className="rp-b-abrir" onClick={() => setAberta(true)} aria-expanded={false}>
          <span>Bancada</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="rp-bancada" aria-label="Bancada de teste">
      <header className="rp-b-cab">
        <div>
          <strong>Bancada</strong>
          <small>fora do desenho · proposta {s.proposta.letra}</small>
        </div>
        <button type="button" onClick={() => setAberta(false)} aria-expanded={true}>Recolher</button>
      </header>

      <div className="rp-b-corpo">
        <nav className="rp-b-links" aria-label="Propostas">
          <Link href="/dev/rolagem" >Índice</Link>
          {(["a", "b", "c", "d", "e"] as const).map((id) => (
            <Link key={id} href={`/dev/rolagem-${id}`} aria-current={s.proposta.id === id ? "page" : undefined}>{id.toUpperCase()}</Link>
          ))}
        </nav>

        <Secao titulo="Ver como">
          <div className="rp-b-seg" role="group" aria-label="Ver como">
            <button type="button" aria-pressed={s.papel === "rola"} onClick={() => s.setPapel("rola")}>Quem rola</button>
            <button type="button" aria-pressed={s.papel === "observa"} onClick={() => s.setPapel("observa")}>Quem observa</button>
          </div>
          {s.papel === "observa" && (
            <div className="rp-b-remoto">
              <small>{s.nomeVisivel}, em outra tela:</small>
              <div className="rp-b-linha">
                <button type="button" disabled={s.rolando} onClick={() => s.rolar(0.55)}>Lançar</button>
                <button type="button" disabled={!ultima || trocada(ultima) || ultima.sobrecarga == null || !ultima.teste.magista} onClick={() => ultima && void s.trocar(ultima.id)}>Trocar</button>
                <button type="button" disabled={!ultima || !trocada(ultima)} onClick={() => ultima && s.desfazer(ultima.id)}>Desfazer</button>
              </div>
            </div>
          )}
        </Secao>

        <Secao titulo="Cenários">
          <div className="rp-b-cenarios">
            {CENARIOS.map((cn) => (
              <button key={cn.id} type="button" onClick={() => s.aplicarCenario(cn.id)} title={cn.detalhe}>
                <b>{cn.rotulo}</b><small>{cn.detalhe}</small>
              </button>
            ))}
          </div>
        </Secao>

        <Secao titulo="Personagem">
          <div className="rp-b-seg" role="group" aria-label="Personagem">
            {s.personagens.map((p) => (
              <button key={p.id} type="button" aria-pressed={s.personagem.id === p.id} onClick={() => s.escolherPersonagem(p.id)}>{p.nome}</button>
            ))}
          </div>
          <label className="rp-b-check"><input type="checkbox" checked={s.magista} onChange={(e) => s.definirMagista(e.target.checked)} /> Magista</label>
          <label className="rp-b-check"><input type="checkbox" checked={s.nomeLongo} onChange={(e) => s.setNomeLongo(e.target.checked)} /> Nome longo</label>
        </Secao>

        <Secao titulo="Conduto">
          <Numero rotulo="Sobrecarga" valor={c.sobrecarga} min={0} max={9} onChange={(n) => s.setConduto({ ...c, sobrecarga: n, rupturas: n >= c.limite ? Math.max(1, c.rupturas) : c.rupturas })} testId="b-sobrecarga" />
          <Numero rotulo="Limite" valor={c.limite} min={LIMITE_INICIAL} max={LIMITE_MAXIMO} onChange={(n) => s.setConduto({ ...c, limite: n })} testId="b-limite" />
          <Numero rotulo="Integridade" valor={c.integridade} min={0} max={20} onChange={(n) => s.setConduto({ ...c, integridade: n })} testId="b-integridade" />
          <Numero rotulo="Rupturas sofridas" valor={c.rupturas} min={c.sobrecarga >= c.limite ? 1 : 0} max={9} onChange={(n) => s.setConduto({ ...c, rupturas: n })} testId="b-rupturas" />
          <p className="rp-b-nota" data-testid="b-proxima">Próxima troca: {proxTexto}</p>
          <label className="rp-b-check"><input type="checkbox" checked={s.substituicaoNaAcao} onChange={(e) => s.setSubstituicaoNaAcao(e.target.checked)} /> Já houve uma substituição nesta ação</label>
        </Secao>

        <Secao titulo="Forçar dados">
          <label className="rp-b-check"><input type="checkbox" checked={s.forcar.ativo} onChange={(e) => s.setForcar({ ...s.forcar, ativo: e.target.checked })} data-testid="b-forcar" /> Forçar valores</label>
          <Numero rotulo="Normal" valor={s.forcar.normal} min={1} max={10} onChange={(n) => s.setForcar({ ...s.forcar, normal: n, ativo: true })} testId="b-normal" />
          <Numero rotulo="Sobrecarga" valor={s.forcar.sobrecarga} min={1} max={10} onChange={(n) => s.setForcar({ ...s.forcar, sobrecarga: n, ativo: true })} testId="b-sobre" />
          <div className="rp-b-num">
            <span>Perda (d4)</span>
            <span className="rp-b-num-ctl">
              <button type="button" aria-label="Diminuir perda forçada" onClick={() => s.setForcar({ ...s.forcar, perda: s.forcar.perda == null ? null : s.forcar.perda <= 1 ? null : s.forcar.perda - 1 })}>−</button>
              <output>{s.forcar.perda ?? "auto"}</output>
              <button type="button" aria-label="Aumentar perda forçada" onClick={() => s.setForcar({ ...s.forcar, perda: Math.min(12, (s.forcar.perda ?? 0) + 1), ativo: true })}>+</button>
            </span>
          </div>
          {!s.forcar.ativo && <p className="rp-b-nota">Desligado: os dados assentam pela física.</p>}
        </Secao>

        <Secao titulo="Contestado (rolagem atual)">
          {ultima && ultima.teste.alvo.tipo === "contestado" ? (
            <Numero rotulo="Total do oponente" valor={ultima.teste.alvo.oponente} min={1} max={40} onChange={(n) => s.ajustarOponente(ultima.id, n)} testId="b-oponente" />
          ) : (
            <p className="rp-b-nota">A última rolagem não é contestada.</p>
          )}
        </Secao>

        <Secao titulo="Medidas · última rolagem">
          <dl className="rp-b-medidas" data-testid="b-medidas">
            <dt>Carga</dt><dd>{tm.cargaMs == null ? "—" : `${tm.cargaMs} ms · força ${Math.round((tm.forca ?? 0) * 100)}%`}</dd>
            <dt>Normal assentou</dt><dd data-testid="b-normal-ms">{ms(tm.normalMs)}</dd>
            <dt>Sobrecarga assentou</dt><dd data-testid="b-sobre-ms">{ms(tm.sobrecargaMs)}</dd>
            <dt>Queda inteira</dt><dd>{ms(tm.quedaMs)}</dd>
            <dt>Quadros</dt><dd data-testid="b-fps">{tm.fpsMedio == null ? "—" : tm.semPintura ? "aba sem pintura" : `${tm.fpsMedio} fps médio · pior ${tm.fpsMinimo}`}</dd>
            <dt>Custo do quadro</dt><dd data-testid="b-custo">{tm.custoMedioMs == null ? "—" : `${tm.custoMedioMs} ms médio · pior ${tm.custoPiorMs} ms`}</dd>
            <dt>Pré-simulação</dt><dd>{ms(tm.preSimMs)}</dd>
            <dt>Troca</dt><dd>{ms(tm.trocaMs)}</dd>
          </dl>
        </Secao>

        <Secao titulo="Outros">
          <label className="rp-b-check"><input type="checkbox" checked={s.reduzidoSimulado} onChange={(e) => s.setReduzidoSimulado(e.target.checked)} /> Simular movimento reduzido</label>
          <button type="button" className="rp-b-largo" onClick={s.limparChat}>Limpar o chat</button>
        </Secao>
      </div>
    </aside>
  );
}
