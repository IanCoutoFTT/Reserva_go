# Pagamento por Pix no ReservaGO

Estado: **implementado e testado em ambiente local; ainda não publicado**. O app continua funcionando como sempre enquanto o pagamento estiver desligado (padrão).

## Como funciona

```
Hóspede                 App                    Edge Function              Banco (Supabase)            Provedor Pix
   |  reserva (Pix)      |                          |                           |                          |
   |-------------------->| createBooking ---------------------------------------> bookings (reservada,     |
   |                     |                          |                           |  total calculado no banco)|
   |                     | pix-create-charge ------>| confere dono e reserva    |                          |
   |                     |                          |-- cria cobrança + repasse --------------------------> |
   |                     |                          |<-- código copia e cola / QR ------------------------- |
   |                     |                          | register_pix_charge ----->| payments (aguardando,     |
   |                     |                          |                           |  anfitrião + plataforma)  |
   |<-- QR + copia e cola|                          |                           |                          |
   |  paga no banco ----------------------------------------------------------------------------------->   |
   |                     |                          |<------ webhook "pago" (token secreto) ------------- |
   |                     |                          | mark_payment_paid ------->| payments = pago           |
   |                     |                          |                           | avisa hóspede e anfitrião |
   |<-- "Pagamento confirmado" (a tela confere a cada 4 s)                      |                          |
```

Se o Pix não for pago em **30 minutos**, a função `expire_pix_payments` (agendada) cancela a reserva e libera as datas.

### Divisão do valor

Calculada **no banco** (migração 013), nunca no app:

| Quem | Recebe |
|---|---|
| Anfitrião | as diárias (noites × preço da noite) |
| Plataforma (ReservaGO) | o que sobra do total pago (taxa de serviço de 10%, já com o desconto de 5% do Pix, ou seja 4,5% das diárias) |

Exemplo: 2 noites × R$ 300, no Pix → o hóspede paga **R$ 627,00**; anfitrião **R$ 600,00**; plataforma **R$ 27,00**.

A comissão vai para **a conta da plataforma**, não para cada admin. Os admins do app são moderadores; como dividir entre a equipe é assunto interno.

## Peças

| Peça | Onde |
|---|---|
| Tabelas, regras de acesso e funções | `supabase/migrations/013_pix_payments.sql` |
| Regras puras (divisão, CPF, token), provedores, fluxos | `supabase/functions/_shared/` (testadas no Jest) |
| Funções publicadas | `supabase/functions/pix-create-charge`, `pix-webhook`, `pix-simulate-payment` |
| Serviço do app | `services/paymentService.ts` |
| Tela | `app/pix-payment.tsx` |
| Liga/desliga | `lib/pix.ts` (`EXPO_PUBLIC_PIX_ENABLED`, `EXPO_PUBLIC_PIX_SIMULATION`) |

Dois provedores:

* **`mock` (simulado)**: não fala com banco nenhum e não move dinheiro. Gera um código inválido de propósito e libera um botão "Simular pagamento (teste)". Serve para demonstrar o ciclo inteiro sem conta em provedor.
* **`asaas`**: escrito a partir da documentação pública. **Ainda não foi testado contra uma conta de testes (Sandbox) do Asaas.** Confira cada resposta lá antes de confiar. Exige CPF do pagador e a conta (walletId) do anfitrião em `payout_accounts`.

## Segurança (o que está garantido e testado)

* O app **não escreve** em `payments` (só leitura, por RLS). Ninguém marca o próprio pagamento como pago.
* Valor cobrado e divisão vêm da reserva no banco. O que o app enviar de valor é ignorado.
* As funções `register_pix_charge`, `mark_payment_paid` e `expire_pix_payments` só rodam com a `service_role`.
* O webhook exige o token secreto; sem `PIX_WEBHOOK_SECRET` configurado, recusa todo mundo.
* Aviso repetido do provedor não duplica notificação (confirmação idempotente).
* Pix pago depois de a reserva ser cancelada gera aviso aos admins para devolver o valor.
* A chave do provedor e a `service_role` ficam só no servidor (segredos das Edge Functions).

Testes: `supabase/tests` não foi alterado; a migração 013 foi validada num banco local (PGlite) com 45 cenários, e as regras das funções com 42 testes no Jest.

## Como ligar (passo a passo)

Faça nesta ordem. Nada disto foi feito ainda no seu Supabase.

1. **Aplicar a migração** `013_pix_payments.sql` no SQL Editor do Supabase.
2. **Agendar o vencimento** (Database > Extensions > ativar `pg_cron`; depois no SQL Editor):
   ```sql
   select cron.schedule('expire-pix', '*/5 * * * *', $$select public.expire_pix_payments()$$);
   ```
3. **Publicar as funções** (precisa da CLI do Supabase: `supabase login` e `supabase link --project-ref <ref>`):
   ```
   supabase secrets set PIX_PROVIDER=mock PIX_WEBHOOK_SECRET=<texto aleatório longo>
   supabase functions deploy pix-create-charge
   supabase functions deploy pix-simulate-payment
   supabase functions deploy pix-webhook --no-verify-jwt
   ```
4. **Ligar no app**: criar as variáveis no EAS (ambiente `preview`) e gerar o APK novo:
   `EXPO_PUBLIC_PIX_ENABLED=true` e, para a demonstração, `EXPO_PUBLIC_PIX_SIMULATION=true`.

Para o provedor real, troque os segredos: `PIX_PROVIDER=asaas`, `ASAAS_API_KEY`, `ASAAS_BASE_URL` (sandbox: `https://api-sandbox.asaas.com/v3`), configure o webhook no painel do Asaas apontando para `https://<ref>.supabase.co/functions/v1/pix-webhook` com o mesmo token, e cadastre a conta de cada anfitrião em `payout_accounts`.

Para **desligar**, gere o APK sem `EXPO_PUBLIC_PIX_ENABLED`: o app volta a confirmar a reserva na hora.

## Roteiro de demonstração (modo simulado)

1. Hóspede reserva uma cabana escolhendo **Pix**. Abre a tela com o valor, o prazo regressivo e o código.
2. Toca em **Simular pagamento (teste)**.
3. A tela muda para "Pagamento confirmado". O hóspede recebe a notificação "Pagamento confirmado".
4. O anfitrião recebe "Pagamento recebido", com o valor do repasse, e vê "Pago" ao lado da reserva em Reservas recebidas.
5. Para mostrar o vencimento: reservar e não pagar; após o prazo a reserva é cancelada e a data fica livre.

Diga na apresentação que é **ambiente de testes**: em produção entra um provedor real (conta verificada).

## O que ainda NÃO existe

* Cadastro da conta de recebimento do anfitrião pela tela (hoje por SQL em `payout_accounts`).
* Devolução de dinheiro (reembolso) quando o hóspede cancela uma reserva já paga. O aviso ao admin existe só para o Pix pago depois do cancelamento.
* Painel do admin com o total de comissões (os dados estão em `payments`, o admin já consegue ler).
* Teste real com o Asaas, nota fiscal, cadastro (KYC) dos anfitriões e demais exigências de um pagamento de verdade.
* Cartão: continua sem cobrança.
