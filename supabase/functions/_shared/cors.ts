export const cabecalhosCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class ErroHttp extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem)
  }
}

export function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function responderErro(e: unknown): Response {
  if (e instanceof ErroHttp) return responder({ ok: false, erro: e.message }, e.status)
  console.error(e)
  return responder({ ok: false, erro: e instanceof Error ? e.message : 'Erro inesperado.' })
}
