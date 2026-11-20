const entidadesHtml: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caractere) => entidadesHtml[caractere]);
}

export function montarEmailConvite(campanhaNome: string, linkConvite: URL) {
  const campanha = escaparHtml(campanhaNome);
  const link = escaparHtml(linkConvite.href);
  const imagem = escaparHtml(new URL("/brand/convite-email.jpg", linkConvite).href);

  return {
    subject: `Convite para jogar em ${campanhaNome.replace(/\s+/g, " ").trim()} | Ruptura VTT`,
    text: `Você recebeu um convite para jogar em ${campanhaNome} no Ruptura VTT.\n\nEntre na campanha: ${linkConvite.href}\n\nSe você não esperava este convite, pode ignorar este e-mail.`,
    html: `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Convite de campanha | Ruptura VTT</title>
</head>
<body style="margin:0;padding:0;background-color:#07090f;color:#d3ecf7;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Seu convite para jogar no Ruptura VTT chegou.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#07090f" style="background-color:#07090f;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <!--[if mso]><table role="presentation" width="530" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0d151c" style="width:100%;max-width:530px;border:1px solid #234655;background-color:#0d151c;">
          <tr>
            <td align="center" bgcolor="#192b32" style="background-color:#192b32;border-bottom:1px solid #298397;">
              <img src="${imagem}" width="528" alt="Ruptura VTT" style="display:block;width:100%;max-width:528px;height:auto;border:0;color:#cfeff4;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:bold;letter-spacing:3px;text-align:center;">
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 24px;">
              <p style="margin:0 0 10px;color:#77bbca;font-family:'Courier New',monospace;font-size:12px;line-height:18px;font-weight:bold;letter-spacing:2.4px;text-align:center;">CONVITE RECEBIDO</p>
              <p style="margin:0 0 24px;color:#bfd4df;font-size:15px;line-height:23px;text-align:center;">Você foi convidado para jogar. Abra o convite e entre com sua conta do Ruptura VTT ou crie uma na hora.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td bgcolor="#10212b" style="padding:16px 17px 14px;background-color:#10212b;border-top:1px solid #285564;border-right:1px solid #285564;border-left:2px solid #ff8a1f;">
                    <p style="margin:0 0 6px;color:#77bbca;font-family:'Courier New',monospace;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:2px;">CAMPANHA</p>
                    <h1 style="margin:0;color:#eaf7ff;font-size:24px;line-height:30px;overflow-wrap:anywhere;">${campanha}</h1>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:13px;border-top:1px dashed #2b5462;">
                      <tr>
                        <td style="padding-top:9px;color:#97c4d0;font-family:'Courier New',monospace;font-size:11px;line-height:16px;letter-spacing:1.8px;">ACESSO</td>
                        <td align="right" style="padding-top:9px;color:#ff9e42;font-family:'Courier New',monospace;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.8px;">JOGADOR</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" bgcolor="#00d4ff" style="background-color:#00d4ff;clip-path:polygon(0 0,100% 0,100% 100%,12px 100%,0 calc(100% - 12px));mso-padding-alt:15px 10px;">
                    <a href="${link}" style="display:block;padding:15px 10px;color:#06121c;font-family:'Arial Black',Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;font-weight:900;letter-spacing:2.15px;text-decoration:none;mso-padding-alt:0;">ENTRAR NA CAMPANHA</a>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0;color:#a8b9c4;font-size:13px;line-height:20px;text-align:center;">Se o botão não abrir, <a href="${link}" style="color:#75d6e8;text-decoration:underline;">acesse o link do convite</a>.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:13px 24px 16px;border-top:1px solid #234655;color:#a8b9c4;font-size:12px;line-height:19px;">
              Se você não esperava este convite, pode ignorar este e-mail.
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}
