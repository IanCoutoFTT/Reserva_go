// Resumo dos erros para a aba do admin: agrupa por mensagem, com quantas vezes e quando foi a última.

export interface ErrorRow {
  id: string;
  created_at: string;
  message: string;
  screen: string | null;
  app_version: string | null;
  platform: string | null;
  user_id?: string | null;
}

export interface ErrorGroup {
  message: string;
  count: number;
  last: string;
  screens: string[];
  versions: string[];
  /** Quantas pessoas diferentes (só as que estavam logadas) viram esse erro. */
  users: number;
  /** Ocorrências nas últimas 24 horas. */
  last24h: number;
}

export function groupErrors(rows: ErrorRow[], now: Date = new Date()): ErrorGroup[] {
  const since = now.getTime() - 24 * 3600_000;
  const map = new Map<string, { g: ErrorGroup; users: Set<string> }>();
  for (const r of rows) {
    let entry = map.get(r.message);
    if (!entry) {
      entry = { g: { message: r.message, count: 0, last: r.created_at, screens: [], versions: [], users: 0, last24h: 0 }, users: new Set() };
      map.set(r.message, entry);
    }
    const { g } = entry;
    g.count += 1;
    if (r.created_at > g.last) g.last = r.created_at;
    if (r.screen && !g.screens.includes(r.screen)) g.screens.push(r.screen);
    if (r.app_version && !g.versions.includes(r.app_version)) g.versions.push(r.app_version);
    if (r.user_id) entry.users.add(r.user_id);
    if (new Date(r.created_at).getTime() >= since) g.last24h += 1;
  }
  return [...map.values()]
    .map(({ g, users }) => ({ ...g, users: users.size }))
    .sort((a, b) => b.last24h - a.last24h || b.count - a.count || (a.last < b.last ? 1 : -1));
}
