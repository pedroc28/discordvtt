/// <reference path="../pb_data/types.d.ts" />

// Funções da viagem da campanha, usadas por viagem.pb.js e campanhas.pb.js com require. O porquê está
// em docs/servidor/README.md, seção "Viagem".

// Contrato com o mapa (app/src/mapa/viagem-campanha.ts): cada campo é um número de 0 a 100 mil. A lista
// de campos não é conferida aqui, para o mapa poder acrescentar um campo numérico sem mudar o servidor.
const LIMITES = {
  campos: 32,
  nome: 40,
  valor: 100000,
  bytes: 4096,
}

function recusar(motivo) {
  throw new BadRequestError(`Viagem recusada: ${motivo}`)
}

module.exports = {
  LIMITES,

  /** A viagem vazia de uma campanha nova, criada na mesma transação da campanha. */
  criarViagem(txApp, campanhaId) {
    const viagem = new Record(txApp.findCollectionByNameOrId('viagens'))
    viagem.set('campanha', campanhaId)
    txApp.save(viagem)
  },

  /** Confere a configuração que o mestre gravou. Vazia (null) volta aos valores padrão do mapa. */
  conferirViagem(e) {
    const texto = e.record.getString('config')
    if (texto.length > LIMITES.bytes) recusar(`a configuração passou de ${LIMITES.bytes} bytes.`)
    let config = null
    try {
      config = JSON.parse(texto || 'null')
    } catch (_) {
      recusar('a configuração não é um JSON válido.')
    }
    if (config !== null) {
      if (typeof config !== 'object' || Array.isArray(config)) recusar('a configuração precisa ser um objeto com números.')
      const campos = Object.keys(config)
      if (campos.length > LIMITES.campos) recusar(`a configuração tem mais de ${LIMITES.campos} campos.`)
      for (const campo of campos) {
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(campo) || campo.length > LIMITES.nome) recusar(`o nome do campo "${campo.slice(0, LIMITES.nome)}" não vale.`)
        const valor = config[campo]
        if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > LIMITES.valor) {
          recusar(`${campo} precisa ser um número de 0 a ${LIMITES.valor}.`)
        }
      }
    }
    e.next()
  },
}
