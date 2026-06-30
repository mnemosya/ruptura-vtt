import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
