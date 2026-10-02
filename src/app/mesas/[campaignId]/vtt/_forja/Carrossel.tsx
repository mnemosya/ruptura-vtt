"use client";

export interface ItemCarrossel {
  id: string;
  nome: string;
  img: string;
  top: string;
  sub: string;
  /** Cor própria do item (região, vertente). Sem ela, a marca é ciano. */
  color?: string;
}

/**
 * Carrossel 3D em trilho curvo. `viewId` é o item em foco (só olhar);
 * `value` é o escolhido. Clicar numa carta lateral traz ela ao centro;
 * clicar na central escolhe.
 */
export function Carrossel({ items, value, viewId, onView, onPick, cta }: {
  items: ItemCarrossel[];
  value: string;
  viewId: string;
  onView: (id: string) => void;
  onPick: (id: string) => void;
  cta: string;
}) {
  const sel = Math.max(0, items.findIndex((i) => i.id === viewId));
  const setSel = (i: number) => onView(items[i].id);
  const go = (d: number) => setSel((sel + d + items.length) % items.length);
  const atual = items[sel];
  const picked = value === atual.id;
  return (
    <div className="fj-carrossel">
      <div className="fj-carrossel__trilho" />
      <div className="fj-carrossel__palco">
        {items.map((it, i) => {
          let d = i - sel;
          if (d > items.length / 2) d -= items.length;
          if (d < -items.length / 2) d += items.length;
          const ad = Math.abs(d);
          const on = d === 0;
          const escolhida = picked && on;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => (on ? onPick(it.id) : setSel(i))}
              aria-label={on ? `${cta}: ${it.nome}` : `Ver ${it.nome}`}
              tabIndex={ad > 1 ? -1 : 0}
              className="fj-carta"
              style={{
                transform: `translate(-50%,-50%) translateX(${d * 62}%) rotateY(${d * -32}deg) scale(${1 - ad * 0.14})`,
                zIndex: 10 - ad,
                opacity: ad > 2 ? 0 : 1 - ad * 0.25,
                filter: on ? "none" : `brightness(${0.55 - ad * 0.1}) saturate(.4)`,
              }}
            >
              <div className={`fj-ch fj-carta__borda ${on ? (picked ? "fj-carta__borda--escolhida" : "fj-carta__borda--foco") : ""}`}>
                <div className="fj-ch fj-carta__corpo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.img} alt="" className="fj-carta__arte" />
                  <div className="fj-carta__veu" />
                  <div className="fj-scan fj-cobre fj-carta__scan" />
                  <div className="fj-carta__topo">{it.top}</div>
                  <div className="fj-carta__base">
                    <div className={`fj-carta__marca ${escolhida ? "fj-carta__marca--escolhida" : ""}`} style={it.color ? { background: it.color, boxShadow: `0 0 10px ${it.color}` } : undefined} />
                    <div className="fj-carta__nome">{it.nome}</div>
                    <div className="fj-carta__sub">{it.sub}</div>
                  </div>
                  {escolhida && <div className="fj-carta__selo">Selecionado</div>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="fj-carrossel__controles">
        <button type="button" onClick={() => go(-1)} className="fj-seta fj-seta--esq" aria-label="Anterior" />
        <button type="button" onClick={() => onPick(atual.id)} className={`fj-ch fj-carrossel__cta ${picked ? "fj-carrossel__cta--escolhido" : ""}`}>
          {picked ? `✓ ${atual.nome}` : cta}
        </button>
        <button type="button" onClick={() => go(1)} className="fj-seta fj-seta--dir" aria-label="Próximo" />
      </div>
      <div className="fj-carrossel__pontos" aria-hidden="true">
        {items.map((it, i) => <span key={it.id} className={`fj-carrossel__ponto ${i === sel ? "fj-carrossel__ponto--atual" : ""}`} />)}
      </div>
    </div>
  );
}
