/** Transporte HTTP compartilhado pelos leitores read-only do Notion. */
const API = "https://api.notion.com/v1";
const INTERVALO_MS = 350;

export interface TransporteNotion {
  chamar<T>(caminho: string, corpo?: unknown): Promise<T>;
  listar<T>(caminho: string, corpo?: Record<string, unknown>): Promise<T[]>;
  requisicoes(): number;
}

export function criarTransporteNotion(token: string, versao: string): TransporteNotion {
  let proximaChamada = Promise.resolve();
  let ultima = 0;
  let total = 0;

  // Serializa as chamadas inclusive quando consumidores futuros fizerem Promise.all.
  async function aguardarVez(): Promise<void> {
    const vez = proximaChamada.then(async () => {
      const espera = ultima + INTERVALO_MS - Date.now();
      if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera));
      ultima = Date.now();
    });
    proximaChamada = vez.catch(() => {});
    await vez;
  }

  async function chamar<T>(caminho: string, corpo?: unknown): Promise<T> {
    for (let tentativa = 0; ; tentativa++) {
      await aguardarVez();
      total++;
      let resp: Response;
      try {
        resp = await fetch(`${API}${caminho}`, {
          method: corpo === undefined ? "GET" : "POST",
          headers: { Authorization: `Bearer ${token}`, "Notion-Version": versao, ...(corpo === undefined ? {} : { "Content-Type": "application/json" }) },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
          signal: AbortSignal.timeout(45_000),
        });
      } catch (error) {
        if (tentativa >= 4) throw new Error(`Falha de rede no Notion em ${caminho} após retries.`, { cause: error });
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** tentativa));
        continue;
      }
      if (resp.ok) return (await resp.json()) as T;
      const temporario = resp.status === 429 || resp.status >= 500;
      if (!temporario || tentativa >= 4) {
        const mensagem = await resp.text().catch(() => "");
        throw new Error(`Notion ${resp.status} em ${caminho}: ${mensagem.slice(0, 300)}`);
      }
      const retry = Number(resp.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retry) && retry > 0 ? retry * 1000 : 1000 * 2 ** tentativa));
    }
  }

  async function listar<T>(caminho: string, corpo?: Record<string, unknown>): Promise<T[]> {
    const todos: T[] = [];
    let cursor: string | undefined;
    do {
      const resposta: { results: T[]; has_more: boolean; next_cursor: string | null } = corpo
        ? await chamar(caminho, { ...corpo, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) })
        : await chamar(`${caminho}${caminho.includes("?") ? "&" : "?"}page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`);
      todos.push(...resposta.results);
      if (resposta.has_more && !resposta.next_cursor) throw new Error(`Notion retornou has_more sem next_cursor em ${caminho}.`);
      cursor = resposta.has_more && resposta.next_cursor ? resposta.next_cursor : undefined;
    } while (cursor);
    return todos;
  }

  return { chamar, listar, requisicoes: () => total };
}
