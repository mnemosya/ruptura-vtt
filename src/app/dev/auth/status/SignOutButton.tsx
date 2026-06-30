"use client";

import { useRouter } from "next/navigation";
import { signOut } from "../../../../lib/auth/actions";

const buttonStyle: React.CSSProperties = {
  background: "#1d1e24",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      data-testid="auth-sair"
      onClick={async () => {
        await signOut();
        router.push("/dev/login");
        router.refresh();
      }}
      style={buttonStyle}
    >
      Sair
    </button>
  );
}
