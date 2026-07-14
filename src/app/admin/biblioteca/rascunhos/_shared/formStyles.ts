import type { CSSProperties } from "react";

export const inputStyle: CSSProperties = {
  background: "#1b1c22",
  border: "1px solid #34343e",
  borderRadius: 6,
  color: "#e8e8ec",
  padding: "7px 10px",
  fontSize: 14,
  width: "100%",
};

export const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  color: "#a8a8b3",
};

export const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

export const sectionStyle: CSSProperties = {
  border: "1px solid #26262e",
  borderRadius: 10,
  padding: 18,
  marginBottom: 16,
};

export const buttonStyle: CSSProperties = {
  background: "#1d1e24",
  border: "1px solid #34343e",
  color: "#e8e8ec",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};

export const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#22301f",
  border: "1px solid #3a5231",
};

export const dangerTextStyle: CSSProperties = { color: "#e08a8a", fontSize: 13 };
export const warnTextStyle: CSSProperties = { color: "#e0c56b", fontSize: 13 };
