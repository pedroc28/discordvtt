/// <reference path="../pb_data/types.d.ts" />

// Configurações do servidor que precisam valer em qualquer instalação.

migrate((app) => {
  const config = app.settings()
  config.meta.appName = 'DiscordVtt'
  // O servidor fica na internet: o limite de tentativas dificulta adivinhar senhas.
  // As regras padrão do PocketBase bastam (login: 2 tentativas a cada 3 segundos por IP).
  config.rateLimits.enabled = true
  app.save(config)
}, (app) => {
  const config = app.settings()
  config.meta.appName = 'Acme'
  config.rateLimits.enabled = false
  app.save(config)
})
