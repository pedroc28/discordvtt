/// <reference path="../pb_data/types.d.ts" />

// Funções da rolagem de dados, usadas por dados.pb.js com require. O porquê está em
// docs/servidor/README.md, seção "Dados".

// Os dados clássicos de RPG. O app mostra um botão para cada um.
const LADOS = [2, 4, 6, 8, 10, 12, 20]

// Rolagens ficam 7 dias, como os lotes do mapa: dá para rever a sessão, e o backup não cresce para sempre.
const DIAS_PADRAO_ROLAGENS = 7

// Uma letra para cada face. O sorteio escolhe uma letra entre as primeiras `lados` com o gerador
// criptográfico do servidor, que dá a mesma chance a cada uma. O Math.random dos hooks não serve:
// não é feito para sorteio que ninguém pode prever.
const FACES = 'abcdefghijklmnopqrst'

/** Um número de 1 a `lados`, cada um com a mesma chance. */
function sortear(lados) {
  const face = $security.randomStringWithAlphabet(1, FACES.slice(0, lados))
  return FACES.indexOf(face) + 1
}

module.exports = {
  LADOS,
  sortear,

  /**
   * Faz a rolagem: confere o dado, sorteia e grava quem rolou. A regra de acesso (participar da
   * campanha, ou ser mestre dela na rolagem secreta) já foi conferida antes deste hook.
   */
  rolar(e) {
    const autor = e.auth
    // O administrador do painel não participa de campanhas.
    if (!autor || autor.collection().name !== 'users') {
      throw new BadRequestError('Rolagem recusada: só quem entrou com uma conta do app rola dados.')
    }
    const lados = e.record.getInt('lados')
    if (!LADOS.includes(lados)) {
      throw new BadRequestError(`Rolagem recusada: o dado precisa ter ${LADOS.join(', ')} lados.`)
    }
    e.record.set('autor', autor.id)
    e.record.set('resultado', sortear(lados))
    e.next()
  },

  /** Apaga as rolagens mais velhas que o prazo, abertas e secretas. */
  limparRolagens(app) {
    const bruto = String($os.getenv('DISCORDVTT_DIAS_ROLAGENS') || '').trim()
    const dias = bruto === '' || !Number.isFinite(Number(bruto)) || Number(bruto) < 0 ? DIAS_PADRAO_ROLAGENS : Number(bruto)
    const limite = new DateTime().addDate(0, 0, -dias).string()
    try {
      // Direto no banco, sem passar pelos hooks: são só registros de histórico, e assim os clientes
      // conectados não recebem um aviso de tempo real por rolagem apagada.
      let apagadas = 0
      for (const tabela of ['rolagens', 'rolagens_secretas']) {
        apagadas += app.db().newQuery(`DELETE FROM ${tabela} WHERE created < {:limite}`).bind({ limite }).execute().rowsAffected()
      }
      if (apagadas > 0) app.logger().info('Rolagens antigas apagadas', 'quantidade', apagadas, 'antesDe', limite)
    } catch (erro) {
      app.logger().error('Não consegui apagar as rolagens antigas', 'erro', String(erro))
    }
  },
}
