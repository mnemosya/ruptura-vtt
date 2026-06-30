import { buttonStyle } from "./styles";

/**
 * Controle manual de PA gastos e Reações usadas no turno/rodada atual.
 * Estado operacional, não progressão — editável em Modo Jogo e Modo
 * Evolução. Não implementa rodada, janela rápida/lenta nem ações;
 * só os contadores manuais pedidos nesta etapa.
 */
function CounterBlock({
  label,
  used,
  max,
  testIdPrefix,
  incrementLabel,
  decrementLabel,
  resetLabel,
  onIncrement,
  onDecrement,
  onReset,
}: {
  label: string;
  used: number;
  max: number;
  testIdPrefix: string;
  incrementLabel: string;
  decrementLabel: string;
  resetLabel: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onReset: () => void;
}) {
  const acimaDoMaximo = used > max;
  const restantes = max - used;

  return (
    <div style={{ background: "#1d1e24", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>
        <span data-testid={`${testIdPrefix}-usados`}>{used}</span> / <span data-testid={`${testIdPrefix}-max`}>{max}</span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>
        restantes: <span data-testid={`${testIdPrefix}-restantes`}>{restantes}</span>
      </div>
      {acimaDoMaximo && (
        <div data-testid={`${testIdPrefix}-aviso`} style={{ fontSize: 11, color: "#f5a623", marginBottom: 8 }}>
          acima do máximo
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button data-testid={`${testIdPrefix}-incrementar`} onClick={onIncrement} style={buttonStyle}>
          {incrementLabel}
        </button>
        <button data-testid={`${testIdPrefix}-decrementar`} onClick={onDecrement} style={buttonStyle}>
          {decrementLabel}
        </button>
        <button data-testid={`${testIdPrefix}-resetar`} onClick={onReset} style={buttonStyle}>
          {resetLabel}
        </button>
      </div>
    </div>
  );
}

export function TurnCounters({
  paGastos,
  paMax,
  reacoesUsadas,
  reacoesMax,
  onGastarPA,
  onDesfazerPA,
  onResetarPA,
  onUsarReacao,
  onDesfazerReacao,
  onResetarReacoes,
}: {
  paGastos: number;
  paMax: number;
  reacoesUsadas: number;
  reacoesMax: number;
  onGastarPA: () => void;
  onDesfazerPA: () => void;
  onResetarPA: () => void;
  onUsarReacao: () => void;
  onDesfazerReacao: () => void;
  onResetarReacoes: () => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
      <CounterBlock
        label="PA"
        used={paGastos}
        max={paMax}
        testIdPrefix="turno-pa"
        incrementLabel="Gastar 1 PA"
        decrementLabel="Desfazer 1 PA"
        resetLabel="Resetar PA"
        onIncrement={onGastarPA}
        onDecrement={onDesfazerPA}
        onReset={onResetarPA}
      />
      <CounterBlock
        label="Reações"
        used={reacoesUsadas}
        max={reacoesMax}
        testIdPrefix="turno-reacoes"
        incrementLabel="Usar reação"
        decrementLabel="Desfazer reação"
        resetLabel="Resetar reações"
        onIncrement={onUsarReacao}
        onDecrement={onDesfazerReacao}
        onReset={onResetarReacoes}
      />
    </div>
  );
}
