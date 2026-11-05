// Edge Function "perguntar": transforma a pergunta em SQL com a IA configurada,
// executa com as permissões do usuário e devolve resposta, dados e visualização.
import { cabecalhosCors, ErroHttp, responder, responderErro } from '../_shared/cors.ts'
import { carregarConfiguracao, criarClientes, usuarioAtual, type ConfigComId } from '../_shared/supabase.ts'
import { enviarMensagens, extrairJson, type Mensagem } from '../_shared/provedores.ts'
import { CONTRATO_SQL, CONTRATO_SQL_EXEMPLO, ESQUEMA, GLOSSARIO, PROMPT_RESPOSTA, PROMPT_SQL, REGRA_DE_PERIODOS } from '../_shared/contexto_ia.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2'

interface Plano {
  sql: string
  formato: string
  visualizacao: Record<string, unknown> | null
  explicacao: string
  precisa_esclarecimento?: boolean
  pergunta_de_esclarecimento?: string | null
}

interface TurnoAnterior {
  pergunta: string
  sql?: string | null
  explicacao?: string | null
}

const FORMATOS = ['texto', 'tabela', 'grafico_barras', 'grafico_linhas', 'grafico_pizza', 'grafico_dispersao', 'dashboard']
const MAX_LINHAS_HISTORICO = 1000
const MAX_LINHAS_AMOSTRA_IA = 200

function dataDeHoje(): string {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

async function montarPromptSql(usuario: SupabaseClient, cenariosIds: string[] | null): Promise<string> {
  const { data: cenarios, error } = await usuario
    .from('cenarios')
    .select('id, nome, descricao, unidade_medida, horizonte_inicio, discretizacao, numero_periodos')
    .eq('status', 'concluido')
    .is('substitui_cenario_id', null)
    .order('data_importacao', { ascending: false })
  if (error) throw new ErroHttp(500, `Não foi possível listar os cenários: ${error.message}`)
  if (!cenarios?.length) throw new ErroHttp(400, 'Nenhum cenário concluído. Inclua um cenário antes de perguntar.')

  const { data: mistura } = await usuario.from('parametros_mistura').select('produto_final, componente, percentual, referencia')
  const listaCenarios = cenarios
    .map((c) => `- id ${c.id} | nome "${c.nome}" | ${c.descricao ?? ''} | unidade ${c.unidade_medida ?? '?'} | início ${c.horizonte_inicio ?? '?'} | ${c.discretizacao ?? '?'} | ${c.numero_periodos ?? '?'} períodos`)
    .join('\n')
  let prompt = PROMPT_SQL
    .replace('{{ESQUEMA}}', ESQUEMA)
    .replace('{{GLOSSARIO}}', GLOSSARIO)
    .replace('{{REGRA_DE_PERIODOS}}', REGRA_DE_PERIODOS)
    .replace('{{CENARIOS}}', listaCenarios)
    .replace('{{DATA_ATUAL}}', dataDeHoje())
  if (mistura?.length) {
    prompt += '\n\nPARÂMETROS DE MISTURA OBRIGATÓRIA (configurados pelo usuário):\n' +
      mistura.map((m) => `- ${m.produto_final}: ${m.percentual}% de ${m.componente} (${m.referencia ?? 'sem referência'})`).join('\n')
  }
  if (cenariosIds?.length) {
    prompt += `\n\nO usuário restringiu esta pergunta aos cenários de id: ${cenariosIds.join(', ')}. Filtre por cenario_id nesses valores.`
  }
  prompt += `\n\nCONTRATO DE RESPOSTA — devolva um único objeto JSON com estes campos:\n${CONTRATO_SQL}\nExemplo de formato: ${CONTRATO_SQL_EXEMPLO}`
  prompt += '\nO SQL deve ser PostgreSQL, uma única instrução SELECT ou WITH, sem ponto e vírgula e sem comentários. Use apelidos de coluna legíveis em português.'
  return prompt
}

async function pedirPlano(config: ConfigComId, chave: string | null, sistema: string, mensagens: Mensagem[]): Promise<{ plano: Plano; bruto: string }> {
  let bruto = await enviarMensagens(config, chave, sistema, mensagens)
  try {
    return { plano: normalizarPlano(extrairJson<Plano>(bruto)), bruto }
  } catch {
    const repetir: Mensagem[] = [...mensagens, { papel: 'assistente', texto: bruto }, { papel: 'usuario', texto: 'Sua resposta não era um JSON válido. Responda SOMENTE com o objeto JSON do contrato.' }]
    bruto = await enviarMensagens(config, chave, sistema, repetir)
    return { plano: normalizarPlano(extrairJson<Plano>(bruto)), bruto }
  }
}

function normalizarPlano(p: Plano): Plano {
  return {
    sql: String(p.sql ?? '').trim(),
    formato: FORMATOS.includes(p.formato) ? p.formato : 'tabela',
    visualizacao: p.visualizacao && typeof p.visualizacao === 'object' ? p.visualizacao : null,
    explicacao: String(p.explicacao ?? ''),
    precisa_esclarecimento: Boolean(p.precisa_esclarecimento),
    pergunta_de_esclarecimento: p.pergunta_de_esclarecimento ?? null,
  }
}

async function executar(usuario: SupabaseClient, sql: string): Promise<{ linhas: Record<string, unknown>[]; erro: string | null; ms: number }> {
  const inicio = Date.now()
  const { data, error } = await usuario.rpc('executar_consulta_ia', { p_sql: sql })
  return { linhas: (data as Record<string, unknown>[] | null) ?? [], erro: error ? error.message : null, ms: Date.now() - inicio }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhosCors })
  try {
    const clientes = criarClientes(req)
    const { usuario } = clientes
    await usuarioAtual(clientes)
    const corpo = await req.json().catch(() => ({}))
    const cenariosIds: string[] | null = Array.isArray(corpo.cenarios_ids) && corpo.cenarios_ids.length ? corpo.cenarios_ids : null
    const { config, chave } = await carregarConfiguracao(usuario, corpo.configuracao_id)

    let pergunta: string
    let plano: Plano

    if (corpo.reexecutar_id) {
      // Executar novamente uma pergunta do histórico com os dados atuais (sem gerar um novo SQL)
      const { data: h, error } = await usuario
        .from('historico_perguntas')
        .select('pergunta, sql_gerado, formato_resultado, especificacao_visual, cenarios_ids')
        .eq('id', corpo.reexecutar_id)
        .maybeSingle()
      if (error || !h) throw new ErroHttp(404, 'Pergunta do histórico não encontrada.')
      if (!h.sql_gerado) throw new ErroHttp(400, 'Esta pergunta não tem consulta salva para executar novamente.')
      pergunta = h.pergunta
      plano = { sql: h.sql_gerado, formato: h.formato_resultado ?? 'tabela', visualizacao: h.especificacao_visual, explicacao: '' }
    } else {
      pergunta = String(corpo.pergunta ?? '').trim()
      if (!pergunta) throw new ErroHttp(400, 'Escreva uma pergunta.')
      if (pergunta.length > 4000) throw new ErroHttp(400, 'A pergunta é muito longa (máximo de 4.000 caracteres).')
      const sistema = await montarPromptSql(usuario, cenariosIds)
      const mensagens: Mensagem[] = []
      const anteriores: TurnoAnterior[] = Array.isArray(corpo.conversa) ? corpo.conversa.slice(-3) : []
      for (const t of anteriores) {
        if (!t.pergunta || !t.sql) continue
        mensagens.push({ papel: 'usuario', texto: t.pergunta })
        mensagens.push({ papel: 'assistente', texto: JSON.stringify({ sql: t.sql, explicacao: t.explicacao ?? '' }) })
      }
      mensagens.push({ papel: 'usuario', texto: pergunta })
      const pedido = await pedirPlano(config, chave, sistema, mensagens)
      plano = pedido.plano

      if (plano.precisa_esclarecimento) {
        const texto = plano.pergunta_de_esclarecimento || 'Pode detalhar melhor a pergunta?'
        const { data: salvo } = await usuario.from('historico_perguntas').insert({
          pergunta, cenarios_ids: cenariosIds, configuracao_ia_id: config.id, formato_resultado: 'texto', resposta: texto,
        }).select('id, criado_em').single()
        return responder({ ok: true, tipo: 'esclarecimento', id: salvo?.id, criado_em: salvo?.criado_em, pergunta, resposta: texto })
      }

      let execucao = await executar(usuario, plano.sql)
      if (execucao.erro) {
        // uma tentativa de correção, enviando o erro do banco para a IA
        const correcao: Mensagem[] = [
          ...mensagens,
          { papel: 'assistente', texto: pedido.bruto },
          { papel: 'usuario', texto: `A consulta falhou no PostgreSQL com o erro: "${execucao.erro}". Corrija o SQL e responda SOMENTE com o JSON do contrato.` },
        ]
        plano = (await pedirPlano(config, chave, sistema, correcao)).plano
        execucao = await executar(usuario, plano.sql)
      }
      if (execucao.erro) {
        await usuario.from('historico_perguntas').insert({
          pergunta, cenarios_ids: cenariosIds, configuracao_ia_id: config.id, sql_gerado: plano.sql, formato_resultado: plano.formato,
          especificacao_visual: plano.visualizacao, erro: execucao.erro,
        })
        return responder({ ok: false, erro: `Não consegui montar uma consulta válida para essa pergunta. Detalhe do banco: ${execucao.erro}`, sql: plano.sql })
      }
      return responder(await concluir(usuario, config, chave, pergunta, plano, execucao, cenariosIds))
    }

    const execucao = await executar(usuario, plano.sql)
    if (execucao.erro) return responder({ ok: false, erro: `A consulta salva não pôde ser executada: ${execucao.erro}`, sql: plano.sql })
    return responder(await concluir(usuario, config, chave, pergunta, plano, execucao, cenariosIds))
  } catch (e) {
    return responderErro(e)
  }
})

async function concluir(
  usuario: SupabaseClient,
  config: ConfigComId,
  chave: string | null,
  pergunta: string,
  plano: Plano,
  execucao: { linhas: Record<string, unknown>[]; ms: number },
  cenariosIds: string[] | null,
) {
  const linhas = execucao.linhas
  const colunas = linhas.length ? Object.keys(linhas[0]) : []
  let resposta = ''
  let destaques: string[] = []
  try {
    const bruto = await enviarMensagens(config, chave, PROMPT_RESPOSTA, [{
      papel: 'usuario',
      texto: JSON.stringify({
        pergunta,
        o_que_a_consulta_faz: plano.explicacao,
        total_de_linhas: linhas.length,
        colunas,
        amostra: linhas.slice(0, MAX_LINHAS_AMOSTRA_IA),
        contrato: { resposta: 'string — resumo em 1 a 3 parágrafos curtos', destaques: 'lista de até 3 strings' },
      }),
    }])
    const r = extrairJson<{ resposta: string; destaques?: string[] }>(bruto)
    resposta = String(r.resposta ?? '')
    destaques = Array.isArray(r.destaques) ? r.destaques.slice(0, 3).map(String) : []
  } catch (e) {
    resposta = linhas.length
      ? `A consulta retornou ${linhas.length} linha(s). Não foi possível gerar o resumo em texto (${e instanceof Error ? e.message : e}).`
      : 'A consulta não retornou dados.'
  }
  if (!linhas.length && !resposta) resposta = 'A consulta não retornou dados.'

  const { data: salvo } = await usuario.from('historico_perguntas').insert({
    pergunta,
    cenarios_ids: cenariosIds,
    configuracao_ia_id: config.id,
    sql_gerado: plano.sql,
    formato_resultado: plano.formato,
    especificacao_visual: plano.visualizacao,
    resposta,
    destaques,
    dados: { colunas, linhas: linhas.slice(0, MAX_LINHAS_HISTORICO) },
    linhas_retornadas: linhas.length,
    tempo_execucao_ms: execucao.ms,
  }).select('id, criado_em').single()

  return {
    ok: true,
    tipo: 'resultado',
    id: salvo?.id ?? null,
    criado_em: salvo?.criado_em ?? new Date().toISOString(),
    pergunta,
    resposta,
    destaques,
    sql: plano.sql,
    explicacao: plano.explicacao,
    formato: plano.formato,
    visualizacao: plano.visualizacao,
    colunas,
    linhas,
    tempo_execucao_ms: execucao.ms,
    configuracao: config.nome,
  }
}
