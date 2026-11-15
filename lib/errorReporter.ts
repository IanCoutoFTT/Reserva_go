// Monitoramento de erros próprio (migração 022). Funções puras de preparo do relatório: limpam dado
// pessoal, cortam nos limites do banco e evitam repetir o mesmo erro em sequência.

export interface ErrorReport {
  message: string;
  stack: string | null;
  screen: string | null;
  app_version: string | null;
  platform: string | null;
}

export const MAX_MESSAGE = 500;
export const MAX_STACK = 4000;
/** O mesmo erro não é reenviado dentro desta janela. */
export const DEDUPE_MS = 60_000;
/** No máximo estes relatórios por abertura do app (um erro em laço não vira enxurrada). */
export const SESSION_CAP = 20;

/**
 * Tira o que não pode sair do aparelho: e-mails, códigos de acesso (JWT), chaves longas e o
 * trecho "access_token"/"code" de URLs de login.
 */
export function scrub(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, '[token]')
    .replace(/\b(sk|pk|whsec|rk)_(test|live)?_?[A-Za-z0-9]{10,}/g, '[chave]')
    .replace(/([?&#](?:access_token|refresh_token|code|token|apikey|api_key)=)[^&\s#]+/gi, '$1[removido]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[segredo]');
}

function cut(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

export function buildErrorReport(
  error: unknown,
  ctx: { screen?: string | null; appVersion?: string | null; platform?: string | null } = {}
): ErrorReport {
  const e = error as { message?: unknown; stack?: unknown } | string | null | undefined;
  const rawMessage = typeof e === 'string' ? e : typeof e?.message === 'string' ? e.message : String(e ?? 'erro desconhecido');
  const rawStack = typeof e === 'object' && e && typeof e.stack === 'string' ? e.stack : null;
  const message = cut(scrub(rawMessage).trim() || '(sem mensagem)', MAX_MESSAGE);
  return {
    message,
    stack: rawStack ? cut(scrub(rawStack), MAX_STACK) : null,
    screen: ctx.screen ? cut(ctx.screen, 100) : null,
    app_version: ctx.appVersion ? cut(ctx.appVersion, 40) : null,
    platform: ctx.platform ? cut(ctx.platform, 20) : null,
  };
}

/** Controla o que vale reenviar: repetição recente e teto por sessão. */
export function createReportGate(now: () => number = Date.now) {
  const last = new Map<string, number>();
  let sent = 0;
  return {
    /** true = pode enviar (e já conta como enviado). */
    allow(report: ErrorReport): boolean {
      if (sent >= SESSION_CAP) return false;
      const key = `${report.message}|${(report.stack ?? '').slice(0, 200)}`;
      const t = now();
      const prev = last.get(key);
      if (prev !== undefined && t - prev < DEDUPE_MS) return false;
      last.set(key, t);
      sent += 1;
      return true;
    },
  };
}
