// Quem pode ver o painel de produto (/painel).
// Só e-mail VERIFICADO dá acesso: no login por e-mail e senha, qualquer pessoa poderia criar
// uma conta com o e-mail de uma administradora sem ser dona dele. No login com Google, o e-mail já vem verificado.
export function emailsAdmin(texto = process.env.ADMIN_EMAILS ?? "") {
  return texto.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function ehAdmin(usuario, lista = emailsAdmin()) {
  return Boolean(usuario?.emailVerified === true && usuario.email && lista.includes(usuario.email.toLowerCase()));
}
