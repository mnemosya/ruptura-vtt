import "server-only";

import nodemailer from "nodemailer";
import { montarEmailConvite } from "./emailConviteTemplate";

export function configurarEnvioConvite() {
  const remetente = process.env.CAMPAIGN_INVITE_SMTP_USER?.trim();
  const senha = process.env.CAMPAIGN_INVITE_SMTP_PASSWORD?.trim();
  const site = process.env.CAMPAIGN_INVITE_ORIGIN;
  if (!remetente || !senha || !site) return null;

  let origem: URL;
  try {
    origem = new URL(site);
  } catch {
    return null;
  }
  if (origem.protocol !== "https:" || origem.href !== `${origem.origin}/`) return null;

  const smtp = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    requireTLS: true,
    auth: { user: remetente, pass: senha },
    dnsTimeout: 6_000,
    connectionTimeout: 6_000,
    greetingTimeout: 6_000,
    socketTimeout: 10_000,
  });

  return {
    origem,
    async enviar(destinatario: string, campanha: string, link: URL): Promise<boolean> {
      const resultado = await smtp.sendMail({
        from: { name: "Ruptura VTT", address: remetente },
        to: { name: "", address: destinatario },
        ...montarEmailConvite(campanha, link),
      });
      return resultado.accepted.length === 1;
    },
  };
}
