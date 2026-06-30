export function NumberField({
  label,
  value,
  min,
  max,
  compact,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  compact?: boolean;
  testId?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        background: "#1d1e24",
        borderRadius: 8,
        padding: compact ? "6px 10px" : "10px 14px",
      }}
    >
      <span style={{ fontSize: compact ? 13 : 14 }}>{label}</span>
      <input
        type="number"
        data-testid={testId}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: 56,
          background: "#0f1014",
          color: "inherit",
          border: "1px solid #333",
          borderRadius: 4,
          padding: "2px 6px",
          textAlign: "center",
        }}
      />
    </label>
  );
}
