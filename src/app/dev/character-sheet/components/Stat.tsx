export function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string | number;
  hint?: string;
  testId?: string;
}) {
  return (
    <div style={{ background: "#1d1e24", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{label}</div>
      <div data-testid={testId} style={{ fontSize: 22, fontWeight: 700 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, opacity: 0.4 }}>{hint}</div>}
    </div>
  );
}
