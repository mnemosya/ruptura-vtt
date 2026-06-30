export function ResourceField({
  label,
  value,
  max,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  testId?: string;
  onChange: (value: number) => void;
}) {
  const acimaDoMaximo = value > max;
  return (
    <div style={{ background: "#1d1e24", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="number"
          data-testid={testId}
          value={value}
          min={0}
          step={1}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            width: 64,
            fontSize: 18,
            fontWeight: 700,
            background: "#0f1014",
            color: "inherit",
            border: "1px solid #333",
            borderRadius: 4,
            padding: "4px 6px",
            textAlign: "center",
          }}
        />
        <span style={{ fontSize: 13, opacity: 0.5 }}>/ {max}</span>
      </div>
      {acimaDoMaximo && (
        <div data-testid={testId ? `${testId}-aviso` : undefined} style={{ fontSize: 11, color: "#f5a623", marginTop: 4 }}>
          acima do máximo
        </div>
      )}
    </div>
  );
}
