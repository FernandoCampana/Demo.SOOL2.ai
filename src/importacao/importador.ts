import { supabase } from '../lib/supabase'
import { TABELAS_IMPORTACAO } from './esquema.gerado'
import { rotuloTabela } from '../lib/rotulos'
import type { ResultadoLeitura } from './parser'

export type Progresso = (percentual: number, etapa: string) => void

const TAMANHO_LOTE = 1000

/** Lê e valida o XML em um Web Worker. */
export function lerArquivo(arquivo: File, aoProgredir: Progresso): Promise<ResultadoLeitura> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const msg = e.data
      if (msg.tipo === 'progresso') aoProgredir(msg.percentual, msg.etapa)
      else {
        worker.terminate()
        if (msg.tipo === 'ok') resolve(msg.resultado as ResultadoLeitura)
        else reject(new Error(msg.mensagem))
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'Falha ao ler o arquivo.'))
    }
    worker.postMessage({ arquivo })
  })
}

interface Gravacao {
  leitura: ResultadoLeitura
  arquivo: File
  nome: string
  /** Estudo ao qual o cenário pertence (informado na inclusão). */
  estudo?: string | null
  usuarioId: string
  /** Na atualização: id do cenário que será substituído. */
  substituiId?: string
  caminhoAnterior?: string | null
  aoProgredir: Progresso
}

/**
 * Grava o cenário no Supabase: cria o registro, guarda o XML no Storage e insere
 * as tabelas em lotes, na ordem das chaves estrangeiras. Em caso de falha, remove
 * o que foi gravado. Na atualização, importa para um cenário temporário e só no
 * final troca os dados em uma única transação (substituir_cenario), mantendo o nome e o estudo.
 */
export async function gravarCenario(g: Gravacao): Promise<string> {
  const { leitura, arquivo, nome, usuarioId, substituiId, aoProgredir } = g
  const c = leitura.cabecalho
  aoProgredir(1, 'Criando o cenário')
  const { data: criado, error } = await supabase
    .from('cenarios')
    .insert({
      nome,
      estudo: g.estudo?.trim() || null,
      descricao: c.descricao,
      unidade_medida: c.unidade_medida,
      horizonte_inicio: c.horizonte_inicio,
      discretizacao: c.discretizacao,
      numero_periodos: c.numero_periodos,
      nome_arquivo: arquivo.name,
      usuario_id: usuarioId,
      substitui_cenario_id: substituiId ?? null,
    })
    .select('id')
    .single()
  if (error || !criado) throw new Error(`Não foi possível criar o cenário: ${error?.message ?? 'sem resposta'}`)
  const id = criado.id as string
  const caminho = `${usuarioId}/${id}/${arquivo.name.replace(/[^\w.\-]+/g, '_')}`

  try {
    aoProgredir(3, 'Guardando o arquivo original')
    const envio = await supabase.storage.from('xml-cenarios').upload(caminho, arquivo, { contentType: 'application/xml', upsert: true })
    if (envio.error) throw new Error(`Não foi possível guardar o arquivo: ${envio.error.message}`)

    let gravados = 0
    for (const mapa of TABELAS_IMPORTACAO) {
      const linhas = leitura.tabelas[mapa.tabela] ?? []
      for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
        const lote = linhas.slice(i, i + TAMANHO_LOTE).map((l) => ({ ...l, cenario_id: id }))
        const r = await supabase.from(mapa.tabela).insert(lote)
        if (r.error) throw new Error(`Falha ao gravar ${rotuloTabela(mapa.tabela).toLowerCase()}: ${r.error.message}`)
        gravados += lote.length
        aoProgredir(5 + Math.round((gravados / Math.max(leitura.total, 1)) * 88), `Gravando ${rotuloTabela(mapa.tabela).toLowerCase()}`)
      }
    }

    aoProgredir(95, 'Finalizando')
    const fim = await supabase
      .from('cenarios')
      .update({ status: 'concluido', total_registros: leitura.total, caminho_arquivo_storage: caminho })
      .eq('id', id)
    if (fim.error) throw new Error(`Não foi possível concluir o cenário: ${fim.error.message}`)

    if (substituiId) {
      aoProgredir(97, 'Substituindo os dados do cenário')
      const troca = await supabase.rpc('substituir_cenario', { p_antigo: substituiId, p_novo: id })
      if (troca.error) throw new Error(`Não foi possível substituir os dados: ${troca.error.message}`)
      if (g.caminhoAnterior && g.caminhoAnterior !== caminho) {
        await supabase.storage.from('xml-cenarios').remove([g.caminhoAnterior])
      }
      aoProgredir(100, 'Concluído')
      return substituiId
    }
    aoProgredir(100, 'Concluído')
    return id
  } catch (e) {
    // desfaz: remove o cenário (as tabelas são apagadas em cascata) e o arquivo
    await supabase.from('cenarios').delete().eq('id', id)
    await supabase.storage.from('xml-cenarios').remove([caminho])
    throw e
  }
}

export async function excluirCenario(id: string, caminho: string | null): Promise<void> {
  const { error } = await supabase.from('cenarios').delete().eq('id', id)
  if (error) throw new Error(`Não foi possível excluir: ${error.message}`)
  if (caminho) await supabase.storage.from('xml-cenarios').remove([caminho])
}
