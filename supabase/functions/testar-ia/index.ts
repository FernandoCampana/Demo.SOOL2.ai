// Edge Function "testar-ia": faz uma chamada mínima à plataforma configurada.
import { cabecalhosCors, ErroHttp, responder, responderErro } from '../_shared/cors.ts'
import { carregarConfiguracao, criarClientes, usuarioAtual } from '../_shared/supabase.ts'
import { enviarMensagens } from '../_shared/provedores.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhosCors })
  try {
    const clientes = criarClientes(req)
    const { usuario } = clientes
    await usuarioAtual(clientes)
    const corpo = await req.json().catch(() => ({}))
    if (!corpo.configuracao_id) throw new ErroHttp(400, 'Informe a configuração a testar.')
    const { config, chave } = await carregarConfiguracao(usuario, corpo.configuracao_id)
    const inicio = Date.now()
    const texto = await enviarMensagens(
      { ...config, limite_tokens: Math.min(config.limite_tokens, 512) },
      chave,
      'Você está sendo testado pelo aplicativo SOOL2.ai. Responda apenas com a palavra OK.',
      [{ papel: 'usuario', texto: 'Teste de conexão.' }],
    )
    return responder({ ok: true, resposta: texto.trim().slice(0, 200) || '(resposta vazia)', tempo_ms: Date.now() - inicio })
  } catch (e) {
    return responderErro(e)
  }
})
