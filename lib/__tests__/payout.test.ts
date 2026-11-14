import { maskCpf, maskPixKey, validatePayoutForm, type PayoutForm } from '../payout';

const base: PayoutForm = { fullName: 'Maria da Silva', cpf: '529.982.247-25', keyType: 'cpf', key: '529.982.247-25' };
const field = (over: Partial<PayoutForm>) => validatePayoutForm({ ...base, ...over });

describe('validatePayoutForm', () => {
  it('aceita e devolve tudo já limpo, do jeito que o banco grava', () => {
    expect(field({ fullName: '  Maria   da Silva ' })).toEqual({
      ok: true,
      value: { full_name: 'Maria da Silva', document: '52998224725', pix_key_type: 'cpf', pix_key: '52998224725' },
    });
  });

  it('nome: exige nome e sobrenome', () => {
    for (const fullName of ['', 'Maria', 'Ma ', '   ']) {
      expect(field({ fullName })).toMatchObject({ ok: false, field: 'fullName' });
    }
    expect(field({ fullName: 'A'.repeat(60) + ' ' + 'B'.repeat(60) })).toMatchObject({ ok: false, field: 'fullName' });
  });

  it('CPF: confere os dígitos verificadores', () => {
    expect(field({ cpf: '123.456.789-00', key: '123.456.789-00' })).toMatchObject({ ok: false, field: 'cpf' });
    expect(field({ cpf: '111.111.111-11', key: '11111111111' })).toMatchObject({ ok: false, field: 'cpf' });
    expect(field({ cpf: '' })).toMatchObject({ ok: false, field: 'cpf' });
  });

  it('chave do tipo CPF precisa ser o CPF do próprio titular', () => {
    expect(field({ key: '111.444.777-35' })).toMatchObject({ ok: false, field: 'key' });
  });

  it('e-mail: minúsculas e formato', () => {
    expect(field({ keyType: 'email', key: ' Maria@Email.COM ' })).toMatchObject({ ok: true, value: { pix_key: 'maria@email.com' } });
    expect(field({ keyType: 'email', key: 'maria.email.com' })).toMatchObject({ ok: false, field: 'key' });
  });

  it('celular: com ou sem +55, vira +55DDDNUMERO', () => {
    expect(field({ keyType: 'telefone', key: '(62) 99999-1234' })).toMatchObject({ ok: true, value: { pix_key: '+5562999991234' } });
    expect(field({ keyType: 'telefone', key: '+55 62 99999-1234' })).toMatchObject({ ok: true, value: { pix_key: '+5562999991234' } });
    expect(field({ keyType: 'telefone', key: '99999-1234' })).toMatchObject({ ok: false, field: 'key' });
  });

  it('chave aleatória: precisa ser UUID', () => {
    expect(field({ keyType: 'aleatoria', key: '123E4567-E89B-42D3-A456-426614174000' })).toMatchObject({
      ok: true,
      value: { pix_key: '123e4567-e89b-42d3-a456-426614174000' },
    });
    expect(field({ keyType: 'aleatoria', key: 'abc123' })).toMatchObject({ ok: false, field: 'key' });
  });

  it('tipo desconhecido é recusado', () => {
    expect(field({ keyType: 'boleto' as never, key: 'x' })).toMatchObject({ ok: false, field: 'key' });
  });
});

describe('máscaras (mostrar dados salvos sem expor)', () => {
  it('CPF mostra só o meio', () => {
    expect(maskCpf('52998224725')).toBe('•••.982.247-••');
    expect(maskCpf('123')).toBe('');
  });
  it('chave Pix por tipo', () => {
    expect(maskPixKey('cpf', '52998224725')).toBe('•••.982.247-••');
    expect(maskPixKey('email', 'maria.silva@email.com')).toBe('ma•••@email.com');
    expect(maskPixKey('telefone', '+5562999991234')).toBe('+5562•••••34');
    expect(maskPixKey('aleatoria', '123e4567-e89b-42d3-a456-426614174000')).toBe('123e••••4000');
  });
  it('valor curto demais não quebra', () => {
    expect(maskPixKey('aleatoria', 'abc')).toBe('•••');
    expect(maskPixKey('email', 'semarroba')).toBe('•••');
  });
});
