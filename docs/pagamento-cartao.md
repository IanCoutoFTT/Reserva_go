# Pagamento por cartão de crédito (Stripe, modo de teste)

Complementa o Pix (`docs/pagamento-pix.md`). **Tudo roda em modo de teste da Stripe: nenhum dinheiro de verdade é cobrado**, e só valem os cartões de teste da própria Stripe. O recurso vem **desligado**: com ele desligado, escolher "Cartão" continua só registrando a reserva, como antes.

## Como funciona

```
Hóspede escolhe "Cartão" e confirma a reserva
        │  (reserva criada como "reservada"; o total vem do banco)
        ▼
App ──► Edge Function card-create-intent ──► Stripe: cria o PaymentIntent (valor em centavos, BRL, só cartão)
        │        └─ banco: register_card_charge grava a cobrança e calcula a divisão
        ▼
App abre a tela de pagamento da Stripe (PaymentSheet): o número do cartão vai DIRETO à Stripe
        ▼
Stripe cobra ──► webhook ──► Edge Function stripe-webhook (confere a assinatura e o valor)
                                  └─ banco: mark_payment_paid  ──► "Pagamento confirmado" (hóspede) / "Pagamento recebido" (anfitrião)
Cartão não concluído em 30 min ──► expire_pix_payments (pg_cron) cancela a reserva e libera as datas
```

* **Divisão do valor**, calculada pelo banco (nunca pelo app): anfitrião = diárias (noites x preço); plataforma = total - diárias. No cartão não há o desconto do Pix, então a plataforma fica com os 10% de taxa de serviço (ex.: 2 noites x R$ 300 = total R$ 660: R$ 600 para o anfitrião e R$ 60 para a plataforma).
* O repasse real ao anfitrião **não é feito**: a divisão fica registrada em `payments` (como no Pix simulado). Repassar de verdade exigiria Stripe Connect e cadastro de cada anfitrião.

## Segurança

* O **número do cartão nunca passa pelo ReservaGO**: é digitado na tela da Stripe e vai direto a ela. Nada de cartão é guardado no banco, no app ou nos logs (o servidor só vê o id da cobrança).
* O app só pede a cobrança informando **qual reserva**; o valor sai da reserva no banco. Valor vindo do app é ignorado.
* O webhook só vale com a **assinatura da Stripe** (`Stripe-Signature`, HMAC-SHA256 com `STRIPE_WEBHOOK_SECRET`), recusa mensagens com mais de 5 min (repetição) e **confere se o valor e a moeda cobrados batem com o banco** antes de confirmar. Sem o segredo configurado, recusa todo mundo.
* A chave **secreta** (`sk_test_...`) e o segredo do webhook ficam só nos secrets das Edge Functions. No app vai só a chave **publicável** (`pk_test_...`), que não cobra nem lê nada.
* Confirmação idempotente: aviso repetido da Stripe não duplica notificação. Pagamento que chega depois de a reserva ser cancelada gera aviso aos admins para devolver o valor.
* O anfitrião precisa ter cadastrado os "Dados para receber"; sem eles a cobrança é recusada.

Testes: a migração 015 foi validada num banco local (PGlite) com 39 cenários, e as regras das funções com testes no Jest (assinatura do webhook, valor divergente, repetição, reabrir cobrança, falha da Stripe etc.).

## Como ligar (passo a passo)

Faça nesta ordem. Nada disto foi feito ainda no Supabase.

1. **Conta na Stripe** (gratuita, https://dashboard.stripe.com/register). Fique no **modo de teste** (chave de teste). Em *Desenvolvedores > Chaves da API* estão a `pk_test_...` e a `sk_test_...`.
   **Meios de pagamento:** a API atual da Stripe não aceita mais o servidor escolher o meio de pagamento; quem decide é o painel. Em *Configurações > Meios de pagamento* (*Settings > Payment methods*), deixe **só Cartões** ligado, para a tela de pagamento mostrar apenas cartão.
2. **Aplicar a migração** `015_card_payments.sql` no SQL Editor (precisa da 013 e da 014 antes; o `pg_cron` do Pix já serve ao cartão).
3. **Publicar as funções** e definir os secrets (a `sk_test_` você cola só no seu terminal, nunca em chat):
   ```
   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
   supabase functions deploy card-create-intent
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
4. **Cadastrar o webhook na Stripe** (*Desenvolvedores > Webhooks > Adicionar endpoint*): URL `https://<ref>.supabase.co/functions/v1/stripe-webhook`, evento `payment_intent.succeeded`. Copie o *segredo de assinatura* (`whsec_...`) e defina:
   ```
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```
5. **Ligar no app**: criar as variáveis no EAS (ambiente `preview`) e gerar o APK novo (o pacote da Stripe é nativo, então não funciona no Expo Go):
   `EXPO_PUBLIC_CARD_ENABLED=true` e `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`.

Para **desligar**, gere o APK sem `EXPO_PUBLIC_CARD_ENABLED`: o app volta a confirmar a reserva na hora.

## Roteiro de demonstração

1. Hóspede reserva uma cabana escolhendo **Cartão de Crédito**. Abre a tela com o valor, o prazo regressivo e o botão **Pagar com cartão**.
2. Na tela da Stripe, usa o cartão de teste `4242 4242 4242 4242`, validade futura e qualquer CVC.
3. A tela mostra "Confirmando..." e depois "Pagamento confirmado". O hóspede recebe a notificação.
4. O anfitrião recebe "Pagamento recebido", com o repasse, e vê "Pago" na reserva.
5. Outros cartões de teste da Stripe: `4000 0000 0000 0002` (recusado), `4000 0027 6000 3184` (pede autenticação 3D Secure).
6. Para mostrar o vencimento: reservar e não pagar; após 30 min a reserva é cancelada e a data fica livre.

Diga na apresentação que é **ambiente de testes** da Stripe. Em produção basta trocar as chaves de teste pelas de produção, depois de a conta ser aprovada.

## O que ainda NÃO existe

* Repasse real ao anfitrião (Stripe Connect), nota fiscal e cadastro (KYC) dos anfitriões.
* Reembolso quando o hóspede cancela uma reserva já paga (o aviso ao admin existe só para o pagamento que chega depois do cancelamento).
* Google Pay e Apple Pay (desligados no plugin).
* Cobrança em parcelas.
