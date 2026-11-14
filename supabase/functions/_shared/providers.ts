// Provedores de Pix. A Edge Function escolhe um pela variável PIX_PROVIDER.
//
//  * "mock"  - SIMULADO. Não fala com banco nenhum e não move dinheiro. Gera um
//              código de mentira e deixa o próprio app "simular o pagamento".
//              Serve para demonstrar o ciclo inteiro (reservar -> pagar ->
//              anfitrião e plataforma recebem) sem conta em provedor.
//  * "asaas" - Asaas (sandbox ou produção, conforme ASAAS_BASE_URL). Escrito a
//              partir da documentação pública e AINDA NÃO TESTADO contra a conta
//              de testes (Sandbox) do Asaas: confira cada resposta lá antes de
//              confiar. Veja docs/pagamento-pix.md.

export interface ChargeRequest {
  bookingId: string;
  amount: number;
  hostAmount: number;
  platformFee: number;
  description: string;
  expiresAt: Date;
  /** Conta do anfitrião no provedor (para o repasse). */
  hostAccountId: string | null;
  payer: { name: string; email: string | null; cpf: string | null };
}

export interface ChargeResult {
  chargeId: string;
  copyPaste: string;
  /** PNG em base64, sem o prefixo "data:". null quando o provedor não manda imagem. */
  qrImageBase64: string | null;
}

export type WebhookEvent = { type: 'paid'; chargeId: string };

export interface PixProvider {
  name: string;
  /** O provedor exige CPF do pagador para gerar o Pix. */
  requiresCpf: boolean;
  /** O provedor precisa da conta do anfitrião para dividir o valor. */
  requiresHostAccount: boolean;
  /** Cabeçalho HTTP em que o provedor manda o token do webhook. */
  webhookTokenHeader: string;
  createCharge(req: ChargeRequest): Promise<ChargeResult>;
  parseWebhook(body: unknown): WebhookEvent | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// ── Simulado ────────────────────────────────────────────────
export function mockProvider(now: () => Date = () => new Date()): PixProvider {
  return {
    name: 'mock',
    requiresCpf: false,
    requiresHostAccount: false,
    webhookTokenHeader: 'x-webhook-token',
    async createCharge(req) {
      const chargeId = `mock_${req.bookingId.slice(0, 8)}_${now().getTime()}`;
      return {
        chargeId,
        // Propositalmente inválido como Pix: nenhum banco aceita, ninguém paga sem querer.
        copyPaste: `SIMULADO-RESERVAGO-${chargeId}-R$${req.amount.toFixed(2)}`,
        qrImageBase64: null,
      };
    },
    parseWebhook(body) {
      const b = asRecord(body);
      if (b?.event === 'PAYMENT_RECEIVED' && typeof b.charge_id === 'string') {
        return { type: 'paid', chargeId: b.charge_id };
      }
      return null;
    },
  };
}

// ── Asaas ───────────────────────────────────────────────────
export interface AsaasConfig {
  apiKey: string;
  /** Sandbox: https://api-sandbox.asaas.com/v3 | Produção: https://api.asaas.com/v3 */
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export function asaasProvider(cfg: AsaasConfig): PixProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  const base = cfg.baseUrl.replace(/\/+$/, '');

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Record<string, unknown>> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', access_token: cfg.apiKey },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = asRecord(await res.json().catch(() => null));
    if (!res.ok || !json) throw new Error(`Asaas ${method} ${path} respondeu ${res.status}`);
    return json;
  }

  return {
    name: 'asaas',
    requiresCpf: true,
    requiresHostAccount: true,
    webhookTokenHeader: 'asaas-access-token',
    async createCharge(req) {
      if (!req.hostAccountId) throw new Error('Anfitrião sem conta de recebimento.');
      if (!req.payer.cpf) throw new Error('CPF do pagador é obrigatório.');

      const customer = await call('POST', '/customers', {
        name: req.payer.name,
        cpfCnpj: req.payer.cpf,
        email: req.payer.email ?? undefined,
        notificationDisabled: true,
      });
      if (typeof customer.id !== 'string') throw new Error('Asaas não devolveu o cliente.');

      const payment = await call('POST', '/payments', {
        customer: customer.id,
        billingType: 'PIX',
        value: req.amount,
        dueDate: req.expiresAt.toISOString().slice(0, 10),
        description: req.description,
        externalReference: req.bookingId,
        // O que não está no split fica na conta dona da chave (a plataforma).
        split: [{ walletId: req.hostAccountId, fixedValue: req.hostAmount }],
      });
      if (typeof payment.id !== 'string') throw new Error('Asaas não devolveu a cobrança.');

      const qr = await call('GET', `/payments/${encodeURIComponent(payment.id)}/pixQrCode`);
      if (typeof qr.payload !== 'string') throw new Error('Asaas não devolveu o código Pix.');

      return {
        chargeId: payment.id,
        copyPaste: qr.payload,
        qrImageBase64: typeof qr.encodedImage === 'string' ? qr.encodedImage : null,
      };
    },
    parseWebhook(body) {
      const b = asRecord(body);
      const p = asRecord(b?.payment);
      const paid = b?.event === 'PAYMENT_RECEIVED' || b?.event === 'PAYMENT_CONFIRMED';
      if (paid && typeof p?.id === 'string') return { type: 'paid', chargeId: p.id };
      return null;
    },
  };
}
