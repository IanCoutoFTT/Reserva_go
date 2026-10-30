// Teste de segurança 29/10/2026 (achado S-14): o app faz ~70 console.log de
// depuração, alguns com dado pessoal ou de sessão (e-mail do perfil, URL de
// retorno do OAuth com o código de autorização, ids de usuário). Em build de
// release esses logs continuam indo para o log do sistema (logcat no
// Android), que outros processos com permissão de debug e ferramentas de
// suporte conseguem ler.
//
// Em produção (__DEV__ = false) console.log/info/debug viram no-op. warn e
// error continuam ativos, porque são o que serve para diagnosticar falha real.
// Importado como PRIMEIRA linha de app/_layout.tsx, antes de qualquer outro
// módulo do app rodar.
if (!__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}

export {};
