// Apoio do pagamento por cartão (Stripe): chaves de liga/desliga.
import { PIX_ENABLED } from './pix';

/**
 * Chave PUBLICÁVEL da Stripe (pk_test_... no modo de teste). Ela é feita para ficar no
 * app: só permite iniciar o pagamento, nunca cobrar nem ler nada. A chave SECRETA
 * (sk_test_...) vive só no servidor (secret da Edge Function), jamais aqui.
 */
export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

/**
 * O cartão só cobra quando o build é feito com EXPO_PUBLIC_CARD_ENABLED=true E com a chave
 * publicável. Desligado (padrão), escolher "Cartão" continua só registrando a reserva, como
 * antes. Ligue só depois de aplicar a migração 015 e publicar as funções (docs/pagamento-cartao.md).
 */
export const CARD_ENABLED = process.env.EXPO_PUBLIC_CARD_ENABLED === 'true' && STRIPE_PUBLISHABLE_KEY.length > 0;

/** Há algum meio de pagamento cobrando de verdade neste build (Pix e/ou cartão). */
export const PAYMENTS_ENABLED = PIX_ENABLED || CARD_ENABLED;

/** Chave de teste (pk_test_...): nenhum dinheiro de verdade é cobrado; só valem os cartões de teste da Stripe. */
export function isStripeTestKey(key: string = STRIPE_PUBLISHABLE_KEY): boolean {
  return key.startsWith('pk_test_');
}

/** Cartão de teste que a Stripe aceita sempre (mostrado na tela só no modo de teste). */
export const TEST_CARD_NUMBER = '4242 4242 4242 4242';
