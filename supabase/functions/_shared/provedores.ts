/** Adaptadores das plataformas de IA, com uma interface comum. */
export type Provedor = 'anthropic' | 'openai' | 'google_gemini' | 'azure_openai' | 'compativel_openai'

export interface ConfigIA {
  provedor: Provedor
  modelo: string
  url_base: string | null
  nome_deployment: string | null
  versao_api: string | null
  temperatura: number | null
  limite_tokens: number
}

export interface Mensagem {
  papel: 'usuario' | 'assistente'
  texto: string
}

export class ErroProvedor extends Error {}

const TEMPO_LIMITE_MS = 120_000

async function postar(url: string, cabecalhos: Record<string, string>, corpo: unknown): Promise<any> {
  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cabecalhos },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    })
  } catch (e) {
    throw new ErroProvedor(`Não foi possível conectar a ${new URL(url).host}: ${e instanceof Error ? e.message : e}`)
  }
  const texto = await resp.text()
  let dados: any = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = null
  }
  if (!resp.ok) {
    const msg = dados?.error?.message ?? dados?.error ?? dados?.message ?? texto.slice(0, 300)
    throw new ErroProvedor(`${resp.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`)
  }
  return dados
}

function semBarraFinal(url: string | null): string {
  if (!url) throw new ErroProvedor('Informe a URL base da plataforma.')
  return url.replace(/\/+$/, '')
}

async function anthropic(cfg: ConfigIA, chave: string, sistema: string, msgs: Mensagem[]): Promise<string> {
  const corpo: Record<string, unknown> = {
    model: cfg.modelo,
    max_tokens: cfg.limite_tokens,
    system: sistema,
    messages: msgs.map((m) => ({ role: m.papel === 'usuario' ? 'user' : 'assistant', content: m.texto })),
  }
  if (cfg.temperatura !== null) corpo.temperature = cfg.temperatura
  const dados = await comRepeticao(corpo, (c) =>
    postar('https://api.anthropic.com/v1/messages', { 'x-api-key': chave, 'anthropic-version': '2023-06-01' }, c),
  )
  return (dados.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
}

async function estiloOpenAI(
  url: string,
  cabecalhos: Record<string, string>,
  cfg: ConfigIA,
  sistema: string,
  msgs: Mensagem[],
  campoTokens: 'max_tokens' | 'max_completion_tokens',
  incluirModelo = true,
): Promise<string> {
  const corpo: Record<string, unknown> = {
    messages: [
      { role: 'system', content: sistema },
      ...msgs.map((m) => ({ role: m.papel === 'usuario' ? 'user' : 'assistant', content: m.texto })),
    ],
    [campoTokens]: cfg.limite_tokens,
  }
  if (incluirModelo) corpo.model = cfg.modelo
  if (cfg.temperatura !== null) corpo.temperature = cfg.temperatura
  const dados = await comRepeticao(corpo, (c) => postar(url, cabecalhos, c))
  const conteudo = dados.choices?.[0]?.message?.content
  if (Array.isArray(conteudo)) return conteudo.map((p: any) => p.text ?? '').join('')
  return conteudo ?? ''
}

async function gemini(cfg: ConfigIA, chave: string, sistema: string, msgs: Mensagem[]): Promise<string> {
  const geracao: Record<string, unknown> = { maxOutputTokens: cfg.limite_tokens }
  if (cfg.temperatura !== null) geracao.temperature = cfg.temperatura
  const dados = await postar(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.modelo)}:generateContent`,
    { 'x-goog-api-key': chave },
    {
      systemInstruction: { parts: [{ text: sistema }] },
      contents: msgs.map((m) => ({ role: m.papel === 'usuario' ? 'user' : 'model', parts: [{ text: m.texto }] })),
      generationConfig: geracao,
    },
  )
  const partes = dados.candidates?.[0]?.content?.parts ?? []
  return partes.map((p: any) => p.text ?? '').join('')
}

/**
 * Repete a chamada ajustando parâmetros que alguns modelos recusam:
 * temperatura (modelos recentes só aceitam o padrão) e o nome do limite de tokens.
 */
async function comRepeticao(corpo: Record<string, unknown>, chamar: (c: Record<string, unknown>) => Promise<any>): Promise<any> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await chamar(corpo)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (!msg.startsWith('400')) throw e
      if (/temperature/i.test(msg) && 'temperature' in corpo) {
        delete corpo.temperature
      } else if (/max_completion_tokens/i.test(msg) && 'max_tokens' in corpo) {
        corpo.max_completion_tokens = corpo.max_tokens
        delete corpo.max_tokens
      } else if (/max_tokens/i.test(msg) && 'max_completion_tokens' in corpo) {
        corpo.max_tokens = corpo.max_completion_tokens
        delete corpo.max_completion_tokens
      } else {
        throw e
      }
    }
  }
  return chamar(corpo)
}

/** Envia o prompt de sistema e as mensagens à plataforma configurada e devolve o texto da resposta. */
export async function enviarMensagens(cfg: ConfigIA, chave: string | null, sistema: string, msgs: Mensagem[]): Promise<string> {
  const k = chave ?? ''
  switch (cfg.provedor) {
    case 'anthropic':
      return anthropic(cfg, k, sistema, msgs)
    case 'openai':
      return estiloOpenAI('https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${k}` }, cfg, sistema, msgs, 'max_completion_tokens')
    case 'google_gemini':
      return gemini(cfg, k, sistema, msgs)
    case 'azure_openai': {
      if (!cfg.nome_deployment) throw new ErroProvedor('Informe o nome do deployment do Azure OpenAI.')
      const versao = cfg.versao_api || '2024-10-21'
      const url = `${semBarraFinal(cfg.url_base)}/openai/deployments/${encodeURIComponent(cfg.nome_deployment)}/chat/completions?api-version=${encodeURIComponent(versao)}`
      return estiloOpenAI(url, { 'api-key': k }, cfg, sistema, msgs, 'max_tokens', false)
    }
    case 'compativel_openai': {
      const cab: Record<string, string> = k ? { Authorization: `Bearer ${k}` } : {}
      return estiloOpenAI(`${semBarraFinal(cfg.url_base)}/chat/completions`, cab, cfg, sistema, msgs, 'max_tokens')
    }
    default:
      throw new ErroProvedor(`Plataforma de IA desconhecida: ${cfg.provedor}`)
  }
}

/** Extrai o primeiro objeto JSON de uma resposta (aceita cercas de código e texto ao redor). */
export function extrairJson<T = any>(texto: string): T {
  const semCercas = texto.replace(/```(?:json)?/gi, '').trim()
  const inicio = semCercas.indexOf('{')
  const fim = semCercas.lastIndexOf('}')
  if (inicio < 0 || fim <= inicio) throw new Error('A IA não devolveu um JSON.')
  return JSON.parse(semCercas.slice(inicio, fim + 1)) as T
}
