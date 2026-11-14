import { isValidCpf, onlyDigits } from '../supabase/functions/_shared/pix';

// Dados para recebimento de anfitrião e admin (migração 014). O BANCO é quem
// decide e grava normalizado (gatilho validate_payout_account); esta validação
// só avisa o usuário antes e manda os valores já limpos.

export type PixKeyType = 'cpf' | 'email' | 'telefone' | 'aleatoria';

export const PIX_KEY_TYPES: { value: PixKeyType; label: string; placeholder: string }[] = [
  { value: 'cpf', label: 'CPF', placeholder: 'Seu CPF' },
  { value: 'email', label: 'E-mail', placeholder: 'seu@email.com' },
  { value: 'telefone', label: 'Celular', placeholder: '(62) 99999-0000' },
  { value: 'aleatoria', label: 'Aleatória', placeholder: 'Cole a chave aleatória' },
];

export interface PayoutForm {
  fullName: string;
  cpf: string;
  keyType: PixKeyType;
  key: string;
}

export interface PayoutValue {
  full_name: string;
  document: string;
  pix_key_type: PixKeyType;
  pix_key: string;
}

export type PayoutValidation =
  | { ok: true; value: PayoutValue }
  | { ok: false; field: 'fullName' | 'cpf' | 'key'; message: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_BR_RE = /^55[1-9][0-9][2-9][0-9]{7,8}$/;
const PHONE_NO_COUNTRY_RE = /^[1-9][0-9][2-9][0-9]{7,8}$/;

export function validatePayoutForm(form: PayoutForm): PayoutValidation {
  const fullName = form.fullName.trim().replace(/\s+/g, ' ');
  if (fullName.length < 5 || !fullName.includes(' ')) {
    return { ok: false, field: 'fullName', message: 'Informe o nome completo (nome e sobrenome).' };
  }
  if (fullName.length > 100) {
    return { ok: false, field: 'fullName', message: 'O nome pode ter no máximo 100 letras.' };
  }

  if (!isValidCpf(form.cpf)) {
    return { ok: false, field: 'cpf', message: 'CPF inválido. Confira os números.' };
  }
  const document = onlyDigits(form.cpf);

  const raw = form.key.trim();
  let key: string;
  switch (form.keyType) {
    case 'cpf':
      key = onlyDigits(raw);
      if (key !== document) {
        return { ok: false, field: 'key', message: 'A chave Pix do tipo CPF precisa ser o seu próprio CPF.' };
      }
      break;
    case 'email':
      key = raw.toLowerCase();
      if (!EMAIL_RE.test(key) || key.length > 77) {
        return { ok: false, field: 'key', message: 'E-mail da chave Pix inválido.' };
      }
      break;
    case 'telefone': {
      let digits = onlyDigits(raw);
      if (PHONE_NO_COUNTRY_RE.test(digits)) digits = `55${digits}`;
      if (!PHONE_BR_RE.test(digits)) {
        return { ok: false, field: 'key', message: 'Celular inválido. Use DDD + número.' };
      }
      key = `+${digits}`;
      break;
    }
    case 'aleatoria':
      key = raw.toLowerCase();
      if (!UUID_RE.test(key)) {
        return { ok: false, field: 'key', message: 'Chave aleatória inválida. Cole exatamente como aparece no seu banco.' };
      }
      break;
    default:
      return { ok: false, field: 'key', message: 'Escolha o tipo da chave Pix.' };
  }

  return { ok: true, value: { full_name: fullName, document, pix_key_type: form.keyType, pix_key: key } };
}

/** "52998224725" -> "•••.982.247-••" (mostra só o meio, para conferir sem expor). */
export function maskCpf(document: string): string {
  const d = onlyDigits(document);
  if (d.length !== 11) return '';
  return `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••`;
}

/** Esconde a maior parte da chave ao exibir os dados já salvos. */
export function maskPixKey(type: PixKeyType, key: string): string {
  switch (type) {
    case 'cpf':
      return maskCpf(key);
    case 'email': {
      const [user, domain] = key.split('@');
      return domain ? `${user.slice(0, 2)}•••@${domain}` : '•••';
    }
    case 'telefone':
      return key.length > 4 ? `${key.slice(0, 5)}•••••${key.slice(-2)}` : '•••';
    case 'aleatoria':
      return key.length > 8 ? `${key.slice(0, 4)}••••${key.slice(-4)}` : '•••';
  }
}
