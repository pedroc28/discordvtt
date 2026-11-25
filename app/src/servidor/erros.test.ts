import { describe, expect, it } from 'vitest'
import { DADOS_FECHADO, MAPA_FECHADO, mensagemDeErro, mensagemDeErroDados, mensagemDeErroMapa, mensagemDeErroQuadro, QUADRO_FECHADO } from './erros'

// Mesmo formato do ClientResponseError do SDK do PocketBase.
const erro = (status: number, message = '', data: Record<string, unknown> = {}) => ({ status, response: { status, message, data } })
const ENDERECO = 'http://127.0.0.1:8090'

describe('mensagens de erro', () => {
  it('sem resposta do servidor, diz o endereço e o que conferir', () => {
    const msg = mensagemDeErro(erro(0), 'entrar', ENDERECO)
    expect(msg).toContain(ENDERECO)
    expect(msg).toContain('ligado')
  })

  it('login recusado vira e-mail ou senha incorretos', () => {
    expect(mensagemDeErro(erro(400, 'Failed to authenticate.'), 'entrar', ENDERECO)).toBe('E-mail ou senha incorretos.')
  })

  it('limite de tentativas pede para esperar', () => {
    expect(mensagemDeErro(erro(429), 'entrar', ENDERECO)).toContain('Espere')
  })

  it('a mensagem do servidor sobre o último mestre passa direto', () => {
    const texto = 'A campanha precisa de pelo menos um mestre. Torne outra pessoa mestre antes.'
    expect(mensagemDeErro(erro(400, texto), 'remover', ENDERECO)).toBe(texto)
  })

  it('pessoa repetida na campanha tem mensagem própria', () => {
    const repetida = erro(400, 'Failed to create record.', { usuario: { code: 'validation_not_unique', message: 'Value must be unique.' } })
    expect(mensagemDeErro(repetida, 'adicionar', ENDERECO)).toBe('Essa pessoa já está na campanha.')
  })

  it('regra de acesso recusada explica que só o mestre pode', () => {
    expect(mensagemDeErro(erro(404), 'renomear', ENDERECO)).toContain('Só o mestre')
    expect(mensagemDeErro(erro(400, 'Failed to create record.'), 'adicionar', ENDERECO)).toContain('Só o mestre')
  })

  it('nome de campanha inválido diz o limite', () => {
    expect(mensagemDeErro(erro(400, '', { nome: { code: 'validation_required' } }), 'criar', ENDERECO)).toContain('80')
  })

  it('senha atual errada na troca de senha tem mensagem própria', () => {
    const errada = erro(400, 'Failed to update record.', { oldPassword: { code: 'validation_invalid_old_password', message: 'Missing or invalid old password.' } })
    expect(mensagemDeErro(errada, 'senha', ENDERECO)).toBe('A senha atual está errada.')
    const curta = erro(400, 'Failed to update record.', { password: { code: 'validation_min_text_constraint' } })
    expect(mensagemDeErro(curta, 'senha', ENDERECO)).toContain('8 a 71')
  })

  it('erro desconhecido cai numa mensagem da própria ação', () => {
    expect(mensagemDeErro(new Error('???'), 'apagar', ENDERECO)).toBe('Não consegui apagar a campanha. Tente de novo.')
    expect(mensagemDeErro(erro(500), 'criar', ENDERECO)).toBe('Não consegui criar a campanha. Tente de novo.')
  })
})

describe('mensagens de erro do mapa', () => {
  it('dizem a causa e o que fazer, para vir depois do que o mapa tentava', () => {
    expect(mensagemDeErroMapa(erro(0), ENDERECO)).toBe(`o servidor em ${ENDERECO} não respondeu. Confira se ele está ligado e tente de novo.`)
    expect(mensagemDeErroMapa(erro(404), ENDERECO)).toContain('não participa mais desta campanha')
    expect(mensagemDeErroMapa(erro(413), ENDERECO)).toContain('Divida a importação')
    expect(mensagemDeErroMapa(erro(429), ENDERECO)).toContain('Espere alguns segundos')
  })

  it('repassa o motivo que o servidor deu para recusar o lote', () => {
    const recusa = erro(400, 'Lote recusado: o hexágono (1, 2) não tem terreno.')
    expect(mensagemDeErroMapa(recusa, ENDERECO)).toBe('o servidor recusou: o hexágono (1, 2) não tem terreno.')
  })

  it('repassa o motivo que o servidor deu para recusar a viagem', () => {
    const recusa = erro(400, 'Viagem recusada: estoqueAgua precisa ser um número de 0 a 100000.')
    expect(mensagemDeErroMapa(recusa, ENDERECO)).toBe('o servidor recusou: estoqueAgua precisa ser um número de 0 a 100000.')
  })

  it('mensagens do próprio repositório passam como estão', () => {
    expect(mensagemDeErroMapa(new Error(MAPA_FECHADO), ENDERECO)).toBe(MAPA_FECHADO)
    expect(mensagemDeErroMapa(new Error('outra coisa'), ENDERECO)).toContain('Tente de novo')
  })
})

describe('mensagens de erro dos dados', () => {
  it('dizem a causa e o que fazer, começando com letra minúscula', () => {
    expect(mensagemDeErroDados(erro(0), ENDERECO)).toBe(`o servidor em ${ENDERECO} não respondeu. Confira se ele está ligado e tente de novo.`)
    expect(mensagemDeErroDados(erro(401), ENDERECO)).toContain('Entre de novo na aba Campanha')
    expect(mensagemDeErroDados(erro(429), ENDERECO)).toContain('Espere alguns segundos')
    expect(mensagemDeErroDados(erro(500), ENDERECO)).toContain('Tente de novo daqui a pouco')
  })

  it('o motivo escrito pelo servidor passa adiante', () => {
    const recusada = erro(400, 'Rolagem recusada: o dado precisa ter 2, 4, 6, 8, 10, 12, 20 lados.')
    expect(mensagemDeErroDados(recusada, ENDERECO)).toBe('o servidor recusou: o dado precisa ter 2, 4, 6, 8, 10, 12, 20 lados.')
  })

  it('recusa sem motivo é falta de permissão, diferente para a rolagem secreta', () => {
    expect(mensagemDeErroDados(erro(400, 'Failed to create record.'), ENDERECO)).toContain('não participa mais desta campanha')
    expect(mensagemDeErroDados(erro(400, 'Failed to create record.'), ENDERECO, true)).toContain('ainda é mestre')
  })

  it('mensagens do próprio repositório passam como estão', () => {
    expect(mensagemDeErroDados(new Error(DADOS_FECHADO), ENDERECO)).toBe(DADOS_FECHADO)
    expect(mensagemDeErroDados(new Error('outra coisa'), ENDERECO)).toContain('Tente de novo')
  })
})

describe('mensagens de erro do quadro', () => {
  const comCampo = (campo: string, code: string) => Object.assign(new Error(''), { status: 400, response: { message: 'Failed to create record.', data: { [campo]: { code } } } })

  it('dizem a causa e o que fazer, começando com letra minúscula', () => {
    expect(mensagemDeErroQuadro(erro(0), ENDERECO, 'enviar')).toContain('não respondeu')
    expect(mensagemDeErroQuadro(erro(401), ENDERECO, 'mover')).toContain('Entre de novo na aba Campanha')
    expect(mensagemDeErroQuadro(erro(429), ENDERECO, 'enviar')).toContain('Espere alguns segundos')
    expect(mensagemDeErroQuadro(erro(413), ENDERECO, 'enviar')).toContain('passou de 2 MB')
  })

  it('o motivo escrito pelo servidor passa adiante', () => {
    expect(mensagemDeErroQuadro(erro(400, 'Imagem recusada: a campanha chegou ao limite.'), ENDERECO, 'enviar')).toBe('o servidor recusou: a campanha chegou ao limite.')
    expect(mensagemDeErroQuadro(erro(400, 'Item recusado: a imagem não é desta campanha.'), ENDERECO, 'prender')).toBe('o servidor recusou: a imagem não é desta campanha.')
  })

  it('arquivo grande demais ou que não é imagem tem mensagem própria', () => {
    expect(mensagemDeErroQuadro(comCampo('arquivo', 'validation_file_size_limit'), ENDERECO, 'enviar')).toContain('passou de 2 MB')
    expect(mensagemDeErroQuadro(comCampo('arquivo', 'validation_invalid_mime_type'), ENDERECO, 'enviar')).toContain('PNG, JPEG ou WebP')
    expect(mensagemDeErroQuadro(comCampo('texto', 'validation_max_text_constraint'), ENDERECO, 'editar')).toContain('500 caracteres')
  })

  it('recusa sem motivo é falta de permissão, explicada para cada ação', () => {
    expect(mensagemDeErroQuadro(erro(400, 'Failed to update record.'), ENDERECO, 'editar')).toBe('só quem escreveu a nota edita.')
    expect(mensagemDeErroQuadro(erro(404), ENDERECO, 'tirar')).toContain('só quem prendeu o item ou o mestre')
    expect(mensagemDeErroQuadro(erro(404), ENDERECO, 'renomear')).toContain('só quem enviou a imagem ou o mestre')
  })

  it('mensagens do próprio repositório passam como estão', () => {
    expect(mensagemDeErroQuadro(new Error(QUADRO_FECHADO), ENDERECO, 'mover')).toBe(QUADRO_FECHADO)
  })
})
