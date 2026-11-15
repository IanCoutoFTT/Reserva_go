import { reportError } from '../services/errorService';

/**
 * Registra no Supabase os erros não tratados do JavaScript (migração 022), sem mudar o que o app
 * já fazia com eles: o tratador anterior continua sendo chamado. Instala uma única vez.
 */
export function installGlobalErrorHandler(): void {
  const g = globalThis as unknown as {
    ErrorUtils?: { setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void; getGlobalHandler?: () => ((e: unknown, fatal?: boolean) => void) | undefined };
    __reservagoErrorHandler?: boolean;
  };
  const utils = g.ErrorUtils;
  if (!utils?.setGlobalHandler || g.__reservagoErrorHandler) return;
  g.__reservagoErrorHandler = true;

  const previous = utils.getGlobalHandler?.();
  utils.setGlobalHandler((error, isFatal) => {
    reportError(error, isFatal ? 'erro fatal' : 'erro global');
    previous?.(error, isFatal);
  });
}
