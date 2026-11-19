# Telas de acesso "Refúgio" (login, cadastro e recuperação de senha)

## O que existe

| Rota | Arquivo | O que faz |
|---|---|---|
| `/login` | `app/login.tsx` | E-mail + senha (Supabase) **e** Google (mesmo fluxo PKCE de antes) |
| `/register` | `app/register.tsx` | Cria conta com nome, e-mail e senha |
| `/forgot-password` | `app/forgot-password.tsx` | Passo 1 – envia código de 6 dígitos |
| `/verify-code` | `app/verify-code.tsx` | Passo 2 – confere o código (recuperação **ou** confirmação de cadastro) |
| `/reset-password` | `app/reset-password.tsx` | Passo 3 – grava a nova senha e já entra |

Lógica: `services/authService.ts` (chamadas ao Supabase) e `lib/authValidation.ts`
(validações e mensagens de erro em português). Visual: `components/auth/` e
`constants/Refugio.ts`.

Fluxos:

- **Recuperar senha:** forgot-password → `resetPasswordForEmail` → verify-code →
  `verifyOtp(type: 'recovery')` (evento `PASSWORD_RECOVERY`) → reset-password →
  `updateUser({ password })` (evento `USER_UPDATED`, o AuthContext carrega o perfil) → Explorar.
- **Criar conta:** register → `signUp` → verify-code → `verifyOtp(type: 'email')`
  (evento `SIGNED_IN`) → select-role.
- **Conta sem e-mail confirmado tentando entrar:** o login reenvia o código e abre verify-code.

## Configuração obrigatória no painel do Supabase

1. **Authentication → Sign In / Providers → Email**: ligado, com *Confirm email* ligado.
   Em *Email OTP Length* deixe **6** (precisa bater com `OTP_LENGTH` em `lib/authValidation.ts`).
2. **Authentication → Emails → Templates**: os modelos padrão mandam só um link.
   Troque o corpo destes dois para mostrar o código `{{ .Token }}`:

   **Confirm signup**
   ```html
   <h2>Confirme seu e-mail no ReservaGO</h2>
   <p>Seu código de confirmação:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>Se você não criou uma conta, ignore este e-mail.</p>
   ```

   **Reset Password**
   ```html
   <h2>Recuperação de senha – ReservaGO</h2>
   <p>Use este código no app para criar uma nova senha:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>Se não foi você, ignore este e-mail. Sua senha continua a mesma.</p>
   ```
3. **SMTP:** o servidor de e-mail padrão do Supabase tem limite baixo de envios por hora
   e, em projetos novos, só entrega para e-mails da equipe da organização. Para testar
   com qualquer e-mail (e na banca), configure um SMTP próprio em
   **Project Settings → Authentication → SMTP Settings**.

Nenhuma migração de banco é necessária: a trigger `handle_new_user` já cria o perfil
(usa `full_name`, que o cadastro envia).

## Contas do Google

Quem entrou só com Google não tem senha. Pode continuar com "Entrar com Google" ou usar
"Esqueceu sua senha?" para criar uma senha e passar a entrar também por e-mail.
