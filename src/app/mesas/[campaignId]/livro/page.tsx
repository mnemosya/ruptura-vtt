/**
 * Livro — sumário (PRD §2.1.9). Rota de LEITURA para narrador E
 * jogador (qualquer participante ativo) — nunca expõe rascunho, só
 * conteúdo efetivo com `status === "published"`.
 *
 * Fase 5: o guard próprio (`getCurrentUser` + `getCampaign` +
 * `isCampaignMember`, com telas de erro próprias) saiu — o layout da
 * campanha já resolve login/`not_found`/`no_access` antes desta página
 * renderizar, e `resolveCampaignAccess` é memoizada por request, então
 * a checagem aqui era uma segunda consulta para o mesmo veredito. Como
 * esta rota é aberta aos DOIS papéis, não sobra checagem de papel
 * específica para fazer aqui (diferente de `/biblioteca`, que é
 * exclusiva do narrador e mantém a sua).
 *
 * O link "Gerenciar conteúdo da campanha" também saiu: era o único
 * caminho até `/biblioteca` antes do trilho existir (correção #11 do
 * plano), e agora as duas rotas têm entrada própria na navegação.
 *
 * A leitura dos capítulos NÃO é encapsulada em `.catch(() => [])`
 * (auditoria da Fase 5): esta página tem UM recurso só, e degradá-lo
 * para lista vazia faria uma falha técnica virar a afirmação de
 * domínio "nenhum capítulo publicado ainda" — indistinguível de um
 * Livro genuinamente vazio, e sem saída para o leitor. Deixar o erro
 * subir entrega o `error.tsx` da campanha, que já registra no logger
 * central e oferece "Tentar de novo".
 */

import { resolveCampaignAccess } from "../../../../lib/campaign/access";
import { listCapitulosEffective } from "../../../../lib/campaignContent";
import { comFalhaInjetavel } from "../../../../lib/dev/faultInjection";
import { LivroSumarioClient, type CapituloResumo } from "./LivroSumarioClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function LivroPage({ params }: PageProps) {
  const { campaignId } = await params;
  const access = await resolveCampaignAccess(campaignId);
  if (access.kind !== "ok") return null; // layout já mostra o estado certo

  const docs = await comFalhaInjetavel("livro", () => listCapitulosEffective(campaignId));
  const capitulos: CapituloResumo[] = docs
    .filter((doc) => (doc.payload as { status?: string }).status === "published")
    .map((doc) => {
      const payload = doc.payload as { nome?: string; descricao_curta?: string; categoria?: string; tags?: string[] };
      return {
        slug: doc.slug,
        nome: payload.nome ?? doc.nome ?? doc.slug,
        descricaoCurta: payload.descricao_curta,
        categoria: payload.categoria,
        tags: Array.isArray(payload.tags) ? payload.tags : [],
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <main className="rm-page" style={{ maxWidth: 900 }}>
      <h1 className="rm-page-title" style={{ marginBottom: 4 }}>Livro</h1>
      <p className="rm-faint" style={{ marginBottom: 20 }}>
        Capítulos publicados desta mesa (oficial, override ou homebrew). Rascunhos nunca aparecem aqui.
      </p>
      {capitulos.length === 0 ? (
        <p className="rm-empty" data-testid="livro-vazio">Nenhum capítulo publicado ainda.</p>
      ) : (
        <LivroSumarioClient campaignId={campaignId} capitulos={capitulos} />
      )}
    </main>
  );
}
