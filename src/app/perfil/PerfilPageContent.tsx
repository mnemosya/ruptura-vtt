/**
 * Conteúdo do perfil de uma pessoa (NET-01), usado pelas DUAS entradas
 * — a rota real `/perfil` e a interceptada em
 * `app/mesas/@modal/(...)perfil` — para nenhuma delas duplicar
 * carregamento ou consulta, exatamente como já é feito na ficha.
 *
 * Mostra o que existe e já é autorizado: nome, presença real, as
 * campanhas EM COMUM com quem está olhando e os personagens da pessoa
 * nelas. Sem e-mail, sem biografia, sem avatar — nada disso existe no
 * banco, e inventar aqui seria mock.
 */

import Link from "next/link";
import { readUserProfile } from "../../lib/campaign/userProfileActions";
import { User, Users } from "../_design/icons";
import "./perfil.css";

export interface PerfilPageContentParams {
  userId?: string;
}

export async function PerfilPageContent({ searchParams }: { searchParams: Promise<PerfilPageContentParams> }) {
  const { userId } = await searchParams;
  if (!userId) {
    return <div className="rv-perfil rv-perfil--vazio" role="alert">Perfil não informado.</div>;
  }
  const { profile, error } = await readUserProfile(userId);
  if (error || !profile) {
    // Recusa é recusa: um perfil vazio pareceria "essa pessoa não tem nada".
    return <div className="rv-perfil rv-perfil--vazio" role="alert" data-testid="perfil-recusado">
      {error ?? "Não foi possível abrir este perfil."}
    </div>;
  }

  return (
    <div className="rv-perfil" data-testid="perfil">
      <header className="rv-perfil-cab">
        <span className="rv-perfil-face" aria-hidden="true"><User size={22} strokeWidth={1.3} /></span>
        <div className="rv-perfil-ident">
          <h1 className="rv-perfil-nome" data-testid="perfil-nome">{profile.display_name}</h1>
          <span className="ra-online" data-offline={!profile.online || undefined} data-testid="perfil-presenca">
            <span className="ra-online-dot" aria-hidden="true" />
            <span className="ra-online-txt">{profile.online ? "Online" : "Offline"}</span>
          </span>
        </div>
        {/* Quem olha o próprio perfil vê o que os outros veem — e daqui
            chega às configurações, que é o que ele provavelmente queria. */}
        {profile.is_self && (
          <Link href="/mesas/conta" className="rv-perfil-conta" data-testid="perfil-ir-para-conta">
            Conta e preferências
          </Link>
        )}
      </header>

      <section className="rv-perfil-secao" aria-labelledby="perfil-campanhas">
        <h2 id="perfil-campanhas" className="rv-perfil-secao-titulo">
          <Users size={13} strokeWidth={1.4} aria-hidden="true" />
          {profile.is_self ? "Suas campanhas" : "Campanhas em comum"}
        </h2>
        {profile.campaigns.length === 0 ? (
          <p className="rv-perfil-vazio-nota">Nenhuma campanha em comum.</p>
        ) : (
          <ul className="rv-perfil-lista" data-testid="perfil-campanhas">
            {profile.campaigns.map((c) => (
              <li key={c.campaign_id} className="rv-perfil-linha">
                <Link href={`/mesas/${c.campaign_id}`} className="rv-perfil-campanha">{c.campaign_name}</Link>
                <span className="rv-perfil-papel" data-papel={c.role}>{c.role === "narrator" ? "Narrador" : "Jogador"}</span>
                <span className="rv-perfil-personagens">
                  {c.characters.length === 0
                    ? <em>sem personagem</em>
                    : c.characters.map((p) => p.name).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
