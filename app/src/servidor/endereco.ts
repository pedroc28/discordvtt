// Endereço do servidor. O padrão vem de VITE_POCKETBASE_URL (ver app/.env.example), mas a
// pessoa pode trocar na tela de login. Assim o mesmo site de teste serve a qualquer servidor:
// o PocketBase no próprio PC ou o endereço do Tailscale Funnel de quem hospeda.

const configurado: unknown = import.meta.env.VITE_POCKETBASE_URL

export const ENDERECO_PADRAO = normalizarEndereco(typeof configurado === 'string' ? configurado : '') ?? 'http://127.0.0.1:8090'

// Endereços da própria máquina ou da rede de casa não têm certificado: sem esquema, viram http.
// Todo o resto (como o endereço .ts.net do Funnel) vira https.
const LOCAL = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i

/** Endereço limpo e válido, ou null se o texto não for um endereço http ou https. */
export function normalizarEndereco(texto: string): string | null {
  let bruto = texto.trim()
  if (!bruto) return null
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(bruto)) bruto = `${LOCAL.test(bruto) ? 'http' : 'https'}://${bruto}`
  let url: URL
  try {
    url = new URL(bruto)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname || url.username || url.password) return null
  // Caminho, busca e âncora não fazem sentido no endereço do servidor, exceto um caminho base.
  const caminho = url.pathname.replace(/\/+$/, '')
  return `${url.protocol}//${url.host}${caminho}`
}

/** Endereço só deste PC ou da rede de casa: não serve para chamar amigos de fora. */
export function ehEnderecoLocal(endereco: string): boolean {
  try {
    return LOCAL.test(new URL(endereco).hostname)
  } catch {
    return false
  }
}

// O link de convite leva o endereço do servidor no parâmetro ?servidor=, como o ?tileset= do mapa.
const PARAMETRO = 'servidor'

/** Endereço vindo do link de convite, se houver e for válido. */
export function enderecoDoLink(busca: string): string | null {
  const valor = new URLSearchParams(busca).get(PARAMETRO)
  return valor ? normalizarEndereco(valor) : null
}

/** A página atual sem o parâmetro do servidor, para o endereço do navegador ficar limpo. */
export function semParametroDoServidor(pagina: string): string {
  const url = new URL(pagina)
  url.searchParams.delete(PARAMETRO)
  return url.toString()
}

/** Link do site que já abre com o servidor preenchido na tela de login. */
export function linkDeConvite(pagina: string, endereco: string): string {
  const url = new URL(pagina)
  url.search = ''
  url.hash = ''
  url.searchParams.set(PARAMETRO, endereco)
  return url.toString()
}
