export type StatusCenario = 'importando' | 'atualizando' | 'concluido' | 'erro'

export interface Cenario {
  id: string
  nome: string
  estudo: string | null
  descricao: string | null
  unidade_medida: string | null
  horizonte_inicio: string | null
  discretizacao: string | null
  numero_periodos: number | null
  nome_arquivo: string
  data_importacao: string
  atualizado_em: string | null
  caminho_arquivo_storage: string | null
  status: StatusCenario
  total_registros: number | null
  usuario_id: string
  perfis?: { nome: string } | null
}

export type Provedor = 'anthropic' | 'openai' | 'google_gemini' | 'azure_openai' | 'compativel_openai'

export interface ConfiguracaoIA {
  id: string
  nome: string
  provedor: Provedor
  modelo: string
  url_base: string | null
  nome_deployment: string | null
  versao_api: string | null
  chave_api_mascara: string | null
  temperatura: number | null
  limite_tokens: number
  padrao: boolean
}

export type Formato =
  | 'texto'
  | 'tabela'
  | 'grafico_barras'
  | 'grafico_linhas'
  | 'grafico_pizza'
  | 'grafico_dispersao'
  | 'dashboard'

export interface Kpi {
  rotulo: string
  coluna: string
  agregacao?: 'soma' | 'media' | 'contagem' | 'maximo' | 'minimo' | string
  unidade?: string
}

export interface Painel {
  titulo?: string
  tipo?: string
  eixo_x?: string
  eixo_y?: string[] | string
  serie?: string | null
}

export interface EspecificacaoVisual {
  titulo?: string
  eixo_x?: string
  eixo_y?: string[] | string
  serie?: string | null
  unidade?: string
  kpis?: Kpi[]
  paineis?: Painel[]
}

export type LinhaDados = Record<string, unknown>

export interface Resultado {
  id: number | null
  pergunta: string
  criado_em: string
  resposta: string
  destaques: string[]
  sql: string | null
  explicacao?: string
  formato: Formato
  visualizacao: EspecificacaoVisual | null
  colunas: string[]
  linhas: LinhaDados[]
  linhas_retornadas?: number
  cenarios_ids?: string[] | null
}

export interface ParametroMistura {
  id: number
  produto_final: string
  componente: string
  percentual: number
  referencia: string | null
  vigencia_inicio: string | null
}
