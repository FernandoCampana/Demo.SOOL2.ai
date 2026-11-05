import { XMLParser, XMLValidator } from 'fast-xml-parser'
import {
  SECOES_CONHECIDAS,
  SECOES_SEM_MAPEAMENTO,
  TABELAS_IMPORTACAO,
  type ColunaMapa,
  type TabelaMapa,
} from './esquema.gerado'
import { rotuloTabela } from '../lib/rotulos'

export type Valor = string | number | boolean | null
export type Linha = Record<string, Valor>

export interface CabecalhoCenario {
  descricao: string | null
  unidade_medida: string | null
  horizonte_inicio: string | null
  discretizacao: string | null
  numero_periodos: number | null
}

export interface ResultadoLeitura {
  cabecalho: CabecalhoCenario
  tabelas: Record<string, Linha[]>
  contagens: Record<string, number>
  total: number
  avisos: string[]
}

export class ErroImportacao extends Error {}

type No = Record<string, unknown>

const ehObjeto = (v: unknown): v is No => typeof v === 'object' && v !== null && !Array.isArray(v)

function texto(v: unknown): string | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (ehObjeto(v) && '#text' in v) return texto(v['#text'])
  return null
}

function filhos(no: unknown, nome: string): unknown[] {
  if (!ehObjeto(no)) return []
  const v = no[nome]
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

/** Lê um valor a partir do caminho relativo definido no mapeamento. */
function lerOrigem(no: No, origem: string): string | null {
  if (origem.startsWith('@')) return texto(no['@_' + origem.slice(1)])
  const partes = origem.split('/')
  let atual: unknown = no
  for (let i = 0; i < partes.length; i++) {
    let nome = partes[i]
    let indice = 0
    const marcador = nome.indexOf('#')
    if (marcador > 0) {
      indice = Number(nome.slice(marcador + 1)) - 1
      nome = nome.slice(0, marcador)
    }
    if (nome.startsWith('@')) return texto(ehObjeto(atual) ? atual['@_' + nome.slice(1)] : undefined)
    atual = filhos(atual, nome)[indice]
    if (atual === undefined) return null
  }
  return texto(atual)
}

const RE_NUMERO = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/

/** Converte o texto do XML para o tipo da coluna. Lança ErroImportacao se não for possível. */
export function converter(valor: string | null, coluna: ColunaMapa, onde: string): Valor {
  if (valor === null) {
    if (coluna.obrigatorio) throw new ErroImportacao(`Campo obrigatório vazio: ${onde}.`)
    return null
  }
  const tipo = coluna.tipo.toLowerCase()
  if (tipo === 'numeric' || tipo === 'integer') {
    let s = valor.replace(/\s/g, '')
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '')
    s = s.replace(',', '.')
    if (!RE_NUMERO.test(s)) throw new ErroImportacao(`Número inválido "${valor}" em ${onde}.`)
    if (tipo === 'integer') {
      const n = Number(s)
      if (!Number.isInteger(n)) throw new ErroImportacao(`Número inteiro inválido "${valor}" em ${onde}.`)
      return n
    }
    return s // mantém como texto para não perder precisão; o PostgreSQL converte para numeric
  }
  if (tipo === 'boolean') {
    const s = valor.toLowerCase()
    if (['true', '1', 'sim', 's', 'yes'].includes(s)) return true
    if (['false', '0', 'nao', 'não', 'n', 'no'].includes(s)) return false
    throw new ErroImportacao(`Valor lógico inválido "${valor}" em ${onde}.`)
  }
  if (tipo === 'date') {
    const m = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
    if (/^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10)
    throw new ErroImportacao(`Data inválida "${valor}" em ${onde}.`)
  }
  if (tipo.startsWith('timestamp')) {
    const m = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
    if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}`
    if (/^\d{4}-\d{2}-\d{2}/.test(valor)) return valor
    throw new ErroImportacao(`Data e hora inválida "${valor}" em ${onde}.`)
  }
  if (tipo.startsWith('char(')) {
    const tamanho = Number(tipo.match(/\d+/)?.[0] ?? 0)
    const s = valor.toUpperCase()
    if (tamanho && s.length > tamanho) throw new ErroImportacao(`Texto maior que ${tamanho} caracteres "${valor}" em ${onde}.`)
    return s
  }
  return valor
}

function nosDoElemento(raiz: No, elemento: string): No[] {
  const [primeiro, ...resto] = elemento.split('/')
  if (primeiro !== 'Log2Com') return []
  let atuais: unknown[] = [raiz]
  for (const seg of resto) atuais = atuais.flatMap((n) => filhos(n, seg))
  return atuais.filter(ehObjeto)
}

function lerTabela(raiz: No, mapa: TabelaMapa, avisos: string[]): Linha[] {
  const nos = nosDoElemento(raiz, mapa.elemento)
  const nomeElemento = mapa.elemento.split('/').pop()!
  const fixas = mapa.colunas.filter((c) => !c.origem.startsWith('#'))
  const linhas: Linha[] = []

  if (mapa.matriz) {
    const colNome = mapa.colunas.find((c) => c.origem === '#nome')!
    const colValor = mapa.colunas.find((c) => c.origem === '#conteudo')!
    const ignorar = new Set(fixas.map((c) => c.origem.split('#')[0]).filter((o) => !o.startsWith('@')))
    nos.forEach((no, i) => {
      const base: Linha = {}
      for (const c of fixas) base[c.nome] = converter(lerOrigem(no, c.origem), c, `${nomeElemento} ${i + 1}, ${c.nome}`)
      for (const chave of Object.keys(no)) {
        if (chave.startsWith('@_') || chave === '#text' || ignorar.has(chave)) continue
        const bruto = texto(filhos(no, chave)[0])
        if (bruto === null) continue
        linhas.push({
          ...base,
          [colNome.nome]: converter(chave, colNome, `${nomeElemento} ${i + 1}, ${colNome.nome}`),
          [colValor.nome]: converter(bruto, colValor, `${nomeElemento} ${i + 1}, ${chave}`),
        })
      }
    })
    return linhas
  }

  const conhecidos = new Set(
    fixas.map((c) => (c.origem.startsWith('@') ? '@_' + c.origem.slice(1) : c.origem.split('/')[0].split('#')[0])),
  )
  const desconhecidos = new Set<string>()
  nos.forEach((no, i) => {
    const linha: Linha = {}
    for (const c of fixas) linha[c.nome] = converter(lerOrigem(no, c.origem), c, `${nomeElemento} ${i + 1}, ${c.nome}`)
    for (const chave of Object.keys(no)) if (!conhecidos.has(chave) && chave !== '#text') desconhecidos.add(chave.replace('@_', '@'))
    linhas.push(linha)
  })
  if (desconhecidos.size) avisos.push(`${nomeElemento}: campos não mapeados ignorados (${[...desconhecidos].join(', ')}).`)

  // Registros idênticos repetidos (ex.: a mesma seção aparece duas vezes no XML) são ignorados com aviso;
  // registros com a mesma chave e conteúdo diferente continuam sendo erro.
  let repetidosIguais = 0
  const unicas: Linha[] = []
  const conteudoPorChave = mapa.unicos.map(() => new Map<string, string>())
  for (const l of linhas) {
    const conteudo = JSON.stringify(mapa.colunas.map((c) => l[c.nome] ?? null))
    let igual = false
    mapa.unicos.forEach((chave, j) => {
      const valores = chave.map((c) => l[c])
      if (valores.some((v) => v === null || v === undefined)) return
      const k = JSON.stringify(valores)
      const anterior = conteudoPorChave[j].get(k)
      if (anterior === undefined) conteudoPorChave[j].set(k, conteudo)
      else if (anterior === conteudo) igual = true
      else throw new ErroImportacao(`Registro repetido em ${nomeElemento}: ${chave.join(' + ')} = ${valores.join(' / ')}.`)
    })
    if (igual) repetidosIguais++
    else unicas.push(l)
  }
  if (repetidosIguais) avisos.push(`${nomeElemento}: ${repetidosIguais} registro(s) repetido(s) e idêntico(s) ignorado(s).`)
  return unicas
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  isArray: (_nome, _caminho, _folha, ehAtributo) => !ehAtributo,
})

/** Lê o XML do otimizador (raiz Log2Com) e devolve as linhas de cada tabela. */
export function lerXml(conteudo: string, aoProgredir?: (percentual: number, etapa: string) => void): ResultadoLeitura {
  aoProgredir?.(5, 'Validando o XML')
  const valido = XMLValidator.validate(conteudo)
  if (valido !== true) {
    const e = valido.err
    throw new ErroImportacao(`O arquivo não é um XML válido (linha ${e.line}, coluna ${e.col}): ${e.msg}`)
  }
  aoProgredir?.(20, 'Lendo a estrutura')
  const documento = parser.parse(conteudo) as No
  const raiz = filhos(documento, 'Log2Com')[0]
  if (!ehObjeto(raiz)) {
    throw new ErroImportacao('O arquivo não é um cenário do otimizador: o elemento raiz Log2Com não foi encontrado.')
  }

  const avisos: string[] = []
  for (const secao of Object.keys(raiz)) {
    if (secao.startsWith('@_') || secao === '#text') continue
    if (!SECOES_CONHECIDAS.includes(secao)) avisos.push(`Seção desconhecida ignorada: ${secao}.`)
  }
  for (const secao of SECOES_SEM_MAPEAMENTO) {
    if (filhos(raiz, secao).some((n) => ehObjeto(n) && Object.keys(n).length > 0)) {
      avisos.push(`A seção ${secao} contém dados, mas ainda não é importada (não havia exemplo preenchido para definir as colunas).`)
    }
  }

  const cenario = filhos(raiz, 'Cenario')[0]
  const horizonte = filhos(raiz, 'HorizontePlanejamento')[0]
  const ler = (no: unknown, campo: string) => (ehObjeto(no) ? lerOrigem(no, campo) : null)
  const inicio = ler(horizonte, 'Inicio')
  const periodos = ler(horizonte, 'NumeroPeriodos')
  const cabecalho: CabecalhoCenario = {
    descricao: ler(cenario, 'Descricao'),
    unidade_medida: ler(cenario, 'UnidadeMedida'),
    horizonte_inicio: inicio ? (converter(inicio, { nome: 'horizonte_inicio', tipo: 'date', origem: '', obrigatorio: false }, 'HorizontePlanejamento/Inicio') as string) : null,
    discretizacao: ler(horizonte, 'Discretizacao'),
    numero_periodos: periodos ? (converter(periodos, { nome: 'numero_periodos', tipo: 'integer', origem: '', obrigatorio: false }, 'HorizontePlanejamento/NumeroPeriodos') as number) : null,
  }

  const tabelas: Record<string, Linha[]> = {}
  const contagens: Record<string, number> = {}
  let total = 0
  TABELAS_IMPORTACAO.forEach((mapa, i) => {
    aoProgredir?.(20 + Math.round(((i + 1) / TABELAS_IMPORTACAO.length) * 80), `Lendo ${rotuloTabela(mapa.tabela).toLowerCase()}`)
    const linhas = lerTabela(raiz, mapa, avisos)
    tabelas[mapa.tabela] = linhas
    contagens[mapa.tabela] = linhas.length
    total += linhas.length
  })
  return { cabecalho, tabelas, contagens, total, avisos }
}
