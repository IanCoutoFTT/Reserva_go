import { cancelConfirmMessage } from '../../../lib/booking';
import { LEGAL_CONTACT, LEGAL_UPDATED, PRIVACY_SECTIONS, TERMS_SECTIONS } from '../profileContent';

const text = (sections: { title: string; body: string }[]) => sections.map((s) => `${s.title}\n${s.body}`).join('\n').toLowerCase();

describe('textos legais (LGPD e termos)', () => {
  it('todas as seções têm título e texto, e os ícones existem', () => {
    for (const s of [...PRIVACY_SECTIONS, ...TERMS_SECTIONS]) {
      expect(s.title.length).toBeGreaterThan(2);
      expect(s.body.length).toBeGreaterThan(40);
      expect(s.icon).toBeDefined();
    }
  });

  it('a política cobre o que a LGPD pede: dados, finalidade, base legal, compartilhamento, retenção e direitos', () => {
    const t = text(PRIVACY_SECTIONS);
    for (const termo of ['dados que coletamos', 'para que usamos', 'base legal', 'com quem compartilhamos', 'por quanto tempo', 'seus direitos', 'lgpd']) {
      expect(t).toContain(termo);
    }
    expect(t).toContain('cpf');
    expect(t).toContain('stripe');
  });

  it('não promete o que o app não faz (reembolso automático, criptografia de ponta a ponta, e-mail inventado)', () => {
    const t = text([...PRIVACY_SECTIONS, ...TERMS_SECTIONS]);
    expect(t).not.toMatch(/reembolso integral|50% do valor|7 dias de antecedência/);
    expect(t).not.toContain('reservago.com.br');
    expect(t).not.toMatch(/armazenadas com criptografia de ponta a ponta/);
    expect(t).toContain('não usamos criptografia de ponta a ponta');
    expect(t).toContain('não há reembolso automático');
  });

  it('diz com clareza que dados de cartão não passam pelo app', () => {
    const t = text(PRIVACY_SECTIONS);
    expect(t).toMatch(/não coleta, não vê e não guarda número de cartão/);
  });

  it('traz a data da revisão e um canal de contato', () => {
    expect(LEGAL_UPDATED).toMatch(/2026/);
    expect(LEGAL_CONTACT.length).toBeGreaterThan(10);
    expect(LEGAL_CONTACT).not.toContain('@');
  });
});

describe('cancelConfirmMessage', () => {
  it('reserva não paga: só a confirmação de sempre', () => {
    expect(cancelConfirmMessage('Chalé', false)).toBe('Tem certeza que deseja cancelar a reserva de "Chalé"?');
  });
  it('reserva paga: avisa que não há devolução automática', () => {
    const m = cancelConfirmMessage('Chalé', true);
    expect(m).toContain('Chalé');
    expect(m).toContain('já foi paga');
    expect(m).toContain('não é devolvido automaticamente');
  });
});
