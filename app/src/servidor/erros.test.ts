import { describe, expect, it } from 'vitest'
import { mensagemDeErro } from './erros'

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
