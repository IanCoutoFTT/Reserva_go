import { buildErrorReport, createReportGate, DEDUPE_MS, MAX_MESSAGE, MAX_STACK, scrub, SESSION_CAP } from '../errorReporter';

describe('scrub', () => {
  it('tira e-mails', () => {
    expect(scrub('Falha para maria.silva@gmail.com ao entrar')).toBe('Falha para [e-mail] ao entrar');
  });
  it('tira tokens JWT e chaves', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk';
    expect(scrub(`Authorization: Bearer ${jwt}`)).not.toContain('eyJ');
    expect(scrub('chave sk_test_51AbCdEfGhIjKlMnOp usada')).toContain('[chave]');
    expect(scrub('segredo whsec_abcdef1234567890ABCD')).toContain('[chave]');
  });
  it('tira código e tokens de URL de login', () => {
    const out = scrub('reservago://oauth-callback?code=abc123def&state=x#access_token=SECRETO123');
    expect(out).toContain('code=[removido]');
    expect(out).toContain('access_token=[removido]');
    expect(out).not.toContain('SECRETO123');
    expect(out).not.toContain('abc123def');
  });
  it('tira sequências longas que parecem segredo, mas deixa texto normal', () => {
    expect(scrub('x'.repeat(50))).toBe('[segredo]');
    expect(scrub('TypeError: undefined is not an object (evaluating a.b)')).toBe('TypeError: undefined is not an object (evaluating a.b)');
  });
});

describe('buildErrorReport', () => {
  it('lê Error, texto e valor estranho', () => {
    expect(buildErrorReport(new Error('boom')).message).toBe('boom');
    expect(buildErrorReport('texto solto').message).toBe('texto solto');
    expect(buildErrorReport(null).message).toBe('erro desconhecido');
    expect(buildErrorReport(undefined).message).toBe('erro desconhecido');
  });
  it('guarda tela, versão e plataforma', () => {
    const r = buildErrorReport(new Error('x'), { screen: 'details', appVersion: '1.0.0', platform: 'android' });
    expect(r).toMatchObject({ screen: 'details', app_version: '1.0.0', platform: 'android' });
    expect(r.stack).toContain('Error: x');
  });
  it('corta mensagem e rastreio nos limites do banco', () => {
    const e = new Error('m'.repeat(900));
    e.stack = 's '.repeat(5000);
    const r = buildErrorReport(e);
    expect(r.message.length).toBeLessThanOrEqual(MAX_MESSAGE);
    expect(r.stack!.length).toBeLessThanOrEqual(MAX_STACK);
  });
  it('não vaza e-mail nem segredo pela mensagem ou pelo rastreio', () => {
    const e = new Error('falhou para ana@x.com');
    e.stack = 'at login (token=abc?code=SEGREDO99&x=1)';
    const r = buildErrorReport(e);
    expect(JSON.stringify(r)).not.toContain('ana@x.com');
    expect(JSON.stringify(r)).not.toContain('SEGREDO99');
  });
  it('mensagem vazia vira texto padrão', () => {
    expect(buildErrorReport(new Error('   ')).message).toBe('(sem mensagem)');
  });
});

describe('createReportGate', () => {
  const rep = (message: string) => buildErrorReport(new Error(message));

  it('o mesmo erro não é reenviado dentro de um minuto', () => {
    let t = 1_000;
    const gate = createReportGate(() => t);
    // mesmo objeto de erro: o rastreio (e a linha de quem chamou) fica idêntico em qualquer sistema
    const same = rep('a');
    expect(gate.allow(same)).toBe(true);
    t += 5_000;
    expect(gate.allow(same)).toBe(false);
    t += DEDUPE_MS;
    expect(gate.allow(same)).toBe(true);
  });
  it('erros diferentes passam', () => {
    const gate = createReportGate(() => 1);
    expect(gate.allow(rep('a'))).toBe(true);
    expect(gate.allow(rep('b'))).toBe(true);
  });
  it('teto por sessão: depois de 20 envios, ignora o resto', () => {
    const gate = createReportGate(() => 1);
    let sent = 0;
    for (let i = 0; i < 50; i++) if (gate.allow(rep(`erro ${i}`))) sent++;
    expect(sent).toBe(SESSION_CAP);
  });
});
