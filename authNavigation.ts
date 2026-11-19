import type { Href, Router } from 'expo-router';

/**
 * Sai do fluxo de acesso (login -> cadastro/recuperação -> ...) sem deixar as
 * telas de login empilhadas no "voltar": fecha a pilha e abre o destino.
 */
export function exitAuthFlow(router: Router, target: Href) {
  if (router.canDismiss()) router.dismissAll();
  router.replace(target);
}
