/**
 * Os filtros de rodada, produto e operação vão no fim do texto da pergunta enviado à IA
 * (e gravado no histórico), no formato "[Filtros aplicados: parte; parte; ...]".
 */
const SUFIXO = /\s*\[Filtros aplicados:([^\]]*)\]\s*$/

export interface FiltrosDescritos {
  rodada: string
  produtos: string
  operacoes: string
}

const NOMES_OPERACAO: Record<string, string> = { FOB: 'FOB', CIF: 'CIF', TRANSF: 'Transferência' }

/** Separa o texto da pergunta dos filtros acrescentados no fim. */
export function separarFiltros(texto: string): { pergunta: string; partes: string[] } {
  const m = texto.match(SUFIXO)
  if (!m) return { pergunta: texto.trim(), partes: [] }
  return {
    pergunta: texto.replace(SUFIXO, '').trim(),
    partes: m[1]
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean),
  }
}

/** Texto da pergunta sem os filtros (para títulos, abas e listas). */
export const textoPergunta = (texto: string) => separarFiltros(texto).pergunta

/** Descreve rodada, produtos e operações usados na pergunta; o que não foi filtrado aparece como "todos". */
export function descreverFiltros(texto: string): FiltrosDescritos {
  const d: FiltrosDescritos = { rodada: 'todas', produtos: 'todos', operacoes: 'todas' }
  for (const p of separarFiltros(texto).partes) {
    if (/^apenas a rodada de referência/i.test(p)) d.rodada = 'de referência de cada cenário'
    else if (/^apenas a rodada /i.test(p)) {
      const m = p.match(/^apenas a rodada (.+?) do cenário "(.*)"$/i)
      d.rodada = m ? `${m[1]} (${m[2]})` : p.replace(/^apenas a rodada /i, '')
    } else if (/^apenas os produtos /i.test(p)) d.produtos = p.replace(/^apenas os produtos /i, '')
    else if (/^apenas as operações /i.test(p))
      d.operacoes = p
        .replace(/^apenas as operações /i, '')
        .split(',')
        .map((o) => NOMES_OPERACAO[o.trim()] ?? o.trim())
        .join(', ')
  }
  return d
}
