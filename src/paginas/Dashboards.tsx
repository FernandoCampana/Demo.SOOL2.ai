import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Check, ChevronDown, Download, FileSpreadsheet, FileText, Image as IconeImagem, LayoutDashboard, Loader2, RefreshCw, Search, Sheet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatarNumero } from '../lib/formatacao'
import { PALETA } from '../componentes/Visualizacao'
import { useAvisos } from '../componentes/Avisos'
import { Dialogo } from '../componentes/Dialogo'
import { exportarDashboard, type ColunaVisao, type FormatoExportacao, type VisaoExportacao } from '../lib/exportarDashboard'
import { useFiltroPersistente } from '../lib/filtros'

interface CenarioDash {
  id: string
  nome: string
  estudo: string | null
  unidade_medida: string | null
}

interface Rodada {
  cenario_id: string
  codigo: string
  descricao: string | null
  e_referencia: boolean | null
}

interface LinhaCliente {
  cenario_id: string
  codigo_cliente: string
  codigo_produto: string
  codigo_resultado: string
  demanda: number | null
  demanda_atendida: number | null
  custo_total: number | null
  custo_aquisicao: number | null
  custo_transporte: number | null
  custo_passagem: number | null
}

interface LinhaFluxo {
  cenario_id: string
  codigo_resultado: string
  incoterms: string | null
  codigo_origem: string | null
  codigo_produto: string | null
  codigo_modal: string | null
  resultado: number | null
  custo_total: number | null
}

interface LinhaDemanda {
  cenario_id: string
  cliente: string
  produto: string | null
  limite_inferior: number | null
  limite_superior: number | null
  demanda_atendida: number | null
}

/** Oferta FOB ou CIF da base atual do cenário (volume comprado = resultado_otimizacao). */
interface LinhaOferta {
  cenario_id: string
  codigo: string
  tipo: 'FOB' | 'CIF'
  fornecedor: string | null
  produto: string | null
  cliente: string | null
  modal: string | null
  preco: number | null
  resultado_otimizacao: number | null
}

/** Fluxo de distribuição fornecedor → base do Resultado (origem = código da oferta, frete = código em fretes_fc). */
interface LinhaDistribuicao {
  cenario_id: string
  origem: string
  destino: string
  modal: string | null
  frete: string | null
  resultado_otimizacao: number | null
}

/** Transferência entre bases do Resultado. */
interface LinhaTransferencia {
  cenario_id: string
  origem: string
  destino: string
  modal: string | null
  produto: string | null
  custo_unitario: number | null
  resultado_otimizacao: number | null
}

interface LinhaFrete {
  cenario_id: string
  codigo: string
  valor: number | null
  valor_estimado: number | null
}

interface Cadastro {
  cenario_id: string
  codigo: string
  nome?: string | null
  municipio?: string | null
}

interface DadosCenario {
  rodadas: Rodada[]
  clientes: LinhaCliente[]
  fluxos: LinhaFluxo[]
  demandas: LinhaDemanda[]
  ofertas: LinhaOferta[]
  distribuicao: LinhaDistribuicao[]
  transferencias: LinhaTransferencia[]
  valorFrete: Map<string, number>
  ufCliente: Map<string, string>
  nomeCliente: Map<string, string>
  nomeFornecedor: Map<string, string>
  nomeProduto: Map<string, string>
  nomeModal: Map<string, string>
}

interface Unidade {
  chave: string
  cenario: CenarioDash
  /** Rodada gravada no comparativo ou, para a base atual, uma rodada fictícia "Dados atuais". */
  rodada: Rodada
  /** true = calculada a partir da base atual do cenário (demandas e ofertas), sem usar o comparativo. */
  atual: boolean
  rotulo: string
}

/** Fonte dos dados: 'atual' (base do cenário), 'ref' (rodada de referência), 'todas' ou 'r:<cenário>|<código>' (rodada gravada de um cenário). */
const FONTE_ATUAL = 'atual'
const idRodada = (cenarioId: string, codigo: string) => `r:${cenarioId}|${codigo}`
const ROTULO_ATUAL = 'Dados atuais'

interface Opcao {
  id: string
  rotulo: string
  grupo?: string
}

/** Filtros efetivamente usados nos dashboards (fixados ao clicar em Atualizar dashboards). */
interface FiltrosAplicados {
  estudos: string[]
  ids: string[]
  fontes: string[]
  produtos: string[]
  operacoes: string[]
}

/** Últimos dashboards montados nesta sessão: reapresentados ao voltar para a opção, sem nova leitura do banco. */
let dashboardsMontados: { aplicado: FiltrosAplicados; cache: Map<string, DadosCenario> } | null = null

const SEM_ESTUDO = 'Sem estudo'
const estudoDe = (c: CenarioDash) => c.estudo?.trim() || SEM_ESTUDO
const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
const moedaCompacta = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 2 })
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const percentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const tick = { fill: '#757575', fontSize: 12 }
const OPERACOES: Opcao[] = [
  { id: 'FOB', rotulo: 'FOB (retirada no fornecedor)' },
  { id: 'CIF', rotulo: 'CIF (entregue na base)' },
  { id: 'TRANSF', rotulo: 'Transferência entre bases' },
]
const MAX_SERIES = 8
const MAX_SERIES_UF = 4

function ufDe(municipio: string | null | undefined): string {
  const m = (municipio ?? '').trim()
  const uf = m.includes('-') ? m.split('-').pop()!.trim().toUpperCase() : ''
  return /^[A-Z]{2}$/.test(uf) ? uf : 'Sem UF'
}

/** Lê todas as linhas de uma tabela para os cenários informados, em páginas de 1.000. */
async function buscarTudo<T>(tabela: string, colunas: string, ids: string[]): Promise<T[]> {
  const todos: T[] = []
  const passo = 1000
  for (let de = 0; ; de += passo) {
    const { data, error } = await supabase.from(tabela).select(colunas).in('cenario_id', ids).order('id').range(de, de + passo - 1)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    const lote = (data ?? []) as unknown as T[]
    todos.push(...lote)
    if (lote.length < passo) break
  }
  return todos
}

async function carregarCenarios(ids: string[]): Promise<Map<string, DadosCenario>> {
  const [rodadas, clientes, fluxos, cadClientes, fornecedores, produtos, modais, demandas, ofertasFob, ofertasCif, distribuicao, transferencias, fretes] = await Promise.all([
    buscarTudo<Rodada>('comparativo_resultados', 'cenario_id, codigo, descricao, e_referencia', ids),
    buscarTudo<LinhaCliente>(
      'comparativo_clientes_produtos_resultados',
      'cenario_id, codigo_cliente, codigo_produto, codigo_resultado, demanda, demanda_atendida, custo_total, custo_aquisicao, custo_transporte, custo_passagem',
      ids,
    ),
    buscarTudo<LinhaFluxo>(
      'comparativo_logistica_clientes_produtos_resultados',
      'cenario_id, codigo_resultado, incoterms, codigo_origem, codigo_produto, codigo_modal, resultado, custo_total',
      ids,
    ),
    buscarTudo<Cadastro>('clientes', 'cenario_id, codigo, nome, municipio', ids),
    buscarTudo<Cadastro>('fornecedores', 'cenario_id, codigo, nome', ids),
    buscarTudo<Cadastro>('produtos', 'cenario_id, codigo, nome', ids),
    buscarTudo<Cadastro>('modais', 'cenario_id, codigo, nome', ids),
    buscarTudo<LinhaDemanda>('demandas', 'cenario_id, cliente, produto, limite_inferior, limite_superior, demanda_atendida', ids),
    buscarTudo<Omit<LinhaOferta, 'tipo' | 'cliente' | 'modal'>>('ofertas_fob', 'cenario_id, codigo, fornecedor, produto, preco, resultado_otimizacao', ids),
    buscarTudo<Omit<LinhaOferta, 'tipo'>>('ofertas_cif', 'cenario_id, codigo, fornecedor, produto, cliente, modal, preco, resultado_otimizacao', ids),
    buscarTudo<LinhaDistribuicao>('resultado_distribuicao_fc', 'cenario_id, origem, destino, modal, frete, resultado_otimizacao', ids),
    buscarTudo<LinhaTransferencia>('resultado_transferencias', 'cenario_id, origem, destino, modal, produto, custo_unitario, resultado_otimizacao', ids),
    buscarTudo<LinhaFrete>('fretes_fc', 'cenario_id, codigo, valor, valor_estimado', ids),
  ])
  const mapa = new Map<string, DadosCenario>()
  for (const id of ids) {
    mapa.set(id, {
      rodadas: [],
      clientes: [],
      fluxos: [],
      demandas: [],
      ofertas: [],
      distribuicao: [],
      transferencias: [],
      valorFrete: new Map(),
      ufCliente: new Map(),
      nomeCliente: new Map(),
      nomeFornecedor: new Map(),
      nomeProduto: new Map(),
      nomeModal: new Map(),
    })
  }
  for (const r of rodadas) mapa.get(r.cenario_id)?.rodadas.push(r)
  for (const l of clientes) mapa.get(l.cenario_id)?.clientes.push(l)
  for (const l of fluxos) mapa.get(l.cenario_id)?.fluxos.push(l)
  for (const l of demandas) mapa.get(l.cenario_id)?.demandas.push(l)
  for (const o of ofertasFob) mapa.get(o.cenario_id)?.ofertas.push({ ...o, tipo: 'FOB', cliente: null, modal: null })
  for (const o of ofertasCif) mapa.get(o.cenario_id)?.ofertas.push({ ...o, tipo: 'CIF' })
  for (const l of distribuicao) mapa.get(l.cenario_id)?.distribuicao.push(l)
  for (const l of transferencias) mapa.get(l.cenario_id)?.transferencias.push(l)
  for (const f of fretes) {
    const v = f.valor !== null && f.valor !== undefined && String(f.valor) !== '' ? Number(f.valor) : Number(f.valor_estimado ?? 0)
    if (Number.isFinite(v)) mapa.get(f.cenario_id)?.valorFrete.set(f.codigo, v)
  }
  for (const c of cadClientes) {
    mapa.get(c.cenario_id)?.ufCliente.set(c.codigo, ufDe(c.municipio))
    mapa.get(c.cenario_id)?.nomeCliente.set(c.codigo, c.nome?.trim() || c.codigo)
  }
  for (const c of fornecedores) mapa.get(c.cenario_id)?.nomeFornecedor.set(c.codigo, c.nome?.trim() || c.codigo)
  for (const c of produtos) mapa.get(c.cenario_id)?.nomeProduto.set(c.codigo, c.nome?.trim() || c.codigo)
  for (const c of modais) mapa.get(c.cenario_id)?.nomeModal.set(c.codigo, c.nome?.trim() || c.codigo)
  return mapa
}

/** Lista suspensa com caixas de seleção; com "grupo" nas opções, permite marcar o grupo inteiro. Vazio = todos. */
function Seletor({
  rotulo,
  todos,
  opcoes,
  selecionados,
  aoMudar,
  busca = false,
}: {
  rotulo: string
  todos: string
  opcoes: Opcao[]
  selecionados: string[]
  aoMudar: (ids: string[]) => void
  busca?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => caixa.current && !caixa.current.contains(e.target as Node) && setAberto(false)
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  const grupos = useMemo(() => {
    const t = termo.trim().toLowerCase()
    const mapa = new Map<string, Opcao[]>()
    for (const o of opcoes) {
      const g = o.grupo ?? ''
      if (t && !o.rotulo.toLowerCase().includes(t) && !g.toLowerCase().includes(t)) continue
      mapa.set(g, [...(mapa.get(g) ?? []), o])
    }
    return [...mapa.entries()].sort(([a], [b]) => (a === SEM_ESTUDO ? 1 : b === SEM_ESTUDO ? -1 : a.localeCompare(b, 'pt-BR')))
  }, [opcoes, termo])

  const resumo =
    selecionados.length === 0
      ? todos
      : selecionados.length === 1
        ? opcoes.find((o) => o.id === selecionados[0])?.rotulo ?? '1 selecionado'
        : `${selecionados.length} selecionados`
  const alternar = (id: string) => aoMudar(selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id])
  const alternarGrupo = (ids: string[]) => {
    const tudo = ids.every((id) => selecionados.includes(id))
    aoMudar(tudo ? selecionados.filter((id) => !ids.includes(id)) : [...new Set([...selecionados, ...ids])])
  }

  return (
    <div className="relative min-w-0" ref={caixa}>
      <span className="rotulo">{rotulo}</span>
      <button type="button" className="botao-secundario h-10 w-full justify-between" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
        <span className="truncate">{resumo}</span>
        <ChevronDown size={16} className="shrink-0" />
      </button>
      {aberto && (
        <div className="absolute left-0 z-30 mt-1 w-80 max-w-[90vw] rounded-lg border border-divisor bg-white py-1 shadow-elevada">
          {busca && (
            <div className="px-3 pb-1 pt-2">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-placeholder" />
                <input className="campo h-8 pl-8" placeholder="Buscar" value={termo} onChange={(e) => setTermo(e.target.value)} aria-label={`Buscar em ${rotulo}`} autoFocus />
              </div>
            </div>
          )}
          <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-black/5" onClick={() => aoMudar([])}>
            <span className="flex h-4 w-4 items-center justify-center">{selecionados.length === 0 && <Check size={16} className="text-texto-verde" />}</span>
            {todos}
          </button>
          <div className="my-1 border-t border-divisor" />
          <div className="max-h-80 overflow-auto">
            {grupos.length === 0 && <p className="px-4 py-3 text-sm text-texto-secundario">Nada encontrado.</p>}
            {grupos.map(([grupo, lista]) => {
              const ids = lista.map((o) => o.id)
              const tudo = ids.every((id) => selecionados.includes(id))
              const parte = !tudo && ids.some((id) => selecionados.includes(id))
              return (
                <div key={grupo || '_'} className="py-1">
                  {grupo && (
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-texto-secundario hover:bg-black/5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#2E7D32]"
                        checked={tudo}
                        ref={(el) => {
                          if (el) el.indeterminate = parte
                        }}
                        onChange={() => alternarGrupo(ids)}
                        aria-label={`Selecionar todos de ${grupo}`}
                      />
                      <span className="truncate">{grupo}</span>
                      <span className="ml-auto font-normal normal-case tracking-normal">{lista.length}</span>
                    </label>
                  )}
                  {lista.map((o) => (
                    <label key={o.id} className={`flex cursor-pointer items-center gap-3 py-1.5 pr-4 text-sm hover:bg-black/5 ${grupo ? 'pl-10' : 'pl-4'}`}>
                      <input type="checkbox" className="h-4 w-4 accent-[#2E7D32]" checked={selecionados.includes(o.id)} onChange={() => alternar(o.id)} />
                      <span className="truncate text-texto-forte">{o.rotulo}</span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="cartao p-5">
      <p className="text-sm text-texto-secundario">{rotulo}</p>
      <p className="mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight text-texto-forte" title={valor}>
        {valor}
      </p>
      {detalhe && (
        <p className="mt-0.5 truncate text-xs text-texto-secundario" title={detalhe}>
          {detalhe}
        </p>
      )}
    </div>
  )
}

function Painel({
  titulo,
  subtitulo,
  children,
  largo = false,
  acoes,
  capturar,
}: {
  titulo: string
  subtitulo?: string
  children: ReactNode
  largo?: boolean
  acoes?: ReactNode
  capturar?: (el: HTMLDivElement | null) => void
}) {
  return (
    <section className={`cartao p-5 ${largo ? 'xl:col-span-2' : ''}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <h2 className="font-medium text-texto-forte">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-xs text-texto-secundario">{subtitulo}</p>}
        </div>
        {acoes}
      </div>
      <div className="mt-4" ref={capturar}>
        {children}
      </div>
    </section>
  )
}

/** Barras horizontais, uma por cenário/rodada, empilhando as chaves informadas. */
function BarrasPorUnidade({
  dados,
  chaves,
  formatar,
  empilhar = true,
}: {
  dados: Record<string, unknown>[]
  chaves: { chave: string; nome: string }[]
  formatar: (v: number) => string
  empilhar?: boolean
}) {
  const porLinha = empilhar ? (chaves.length > 1 ? 44 : 34) : Math.max(34, 16 + chaves.length * 14)
  const altura = Math.max(180, 70 + dados.length * porLinha)
  return (
    <div style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
          <XAxis type="number" tick={tick} tickFormatter={(v) => compacto.format(n(v))} />
          <YAxis type="category" dataKey="rotulo" width={210} tick={tick} interval={0} />
          <Tooltip formatter={(v) => formatar(n(v))} />
          {chaves.length > 1 && <Legend />}
          {chaves.map((c, i) => (
            <Bar key={c.chave} dataKey={c.chave} name={c.nome} stackId={empilhar ? 'a' : undefined} fill={PALETA[i % PALETA.length]} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

interface PropsRotuloPizza {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  percent?: number
}

/** Percentual dentro da fatia (omitido em fatias muito pequenas). */
function rotuloPizza(p: PropsRotuloPizza) {
  const pct = n(p.percent)
  if (pct < 0.04) return null
  const raio = n(p.innerRadius) + (n(p.outerRadius) - n(p.innerRadius)) * 0.55
  const ang = (-n(p.midAngle) * Math.PI) / 180
  const x = n(p.cx) + raio * Math.cos(ang)
  const y = n(p.cy) + raio * Math.sin(ang)
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#FFFFFF" fontSize={12} fontWeight={700}>
      {percentual.format(pct)}
    </text>
  )
}

/** Gráficos de pizza, um por cenário/rodada, com a mesma cor para cada fatia em todas as pizzas. */
function PizzasPorUnidade({
  dados,
  chaves,
  formatar,
}: {
  dados: Record<string, unknown>[]
  chaves: { chave: string; nome: string }[]
  formatar: (v: number) => string
}) {
  const cor = (i: number) => PALETA[i % PALETA.length]
  const varias = dados.length > 1
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs">
        {chaves.map((c, i) => (
          <span key={c.chave} className="inline-flex items-center gap-1.5 text-texto-forte">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: cor(i) }} />
            {c.nome}
          </span>
        ))}
      </div>
      <div className={`grid gap-4 ${varias ? 'sm:grid-cols-2' : ''}`}>
        {dados.map((d, idx) => {
          const fatias = chaves.map((c, i) => ({ nome: c.nome, valor: n(d[c.chave]), cor: cor(i) })).filter((f) => f.valor > 0)
          const total = fatias.reduce((s, f) => s + f.valor, 0)
          return (
            <div key={`${String(d.rotulo)}-${idx}`} className="min-w-0">
              {varias && (
                <p className="truncate text-center text-sm font-medium text-texto-forte" title={String(d.rotulo)}>
                  {String(d.rotulo)}
                </p>
              )}
              {total > 0 ? (
                <div style={{ height: varias ? 220 : 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={fatias} dataKey="valor" nameKey="nome" outerRadius="85%" labelLine={false} label={rotuloPizza} isAnimationActive={false} stroke="#FFFFFF">
                        {fatias.map((f) => (
                          <Cell key={f.nome} fill={f.cor} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => `${formatar(n(v))} (${percentual.format(n(v) / total)})`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-texto-secundario">Sem volume.</p>
              )}
              <p className="text-center text-xs text-texto-secundario">Total: {formatar(total)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Barras verticais por categoria, com uma série por cenário/rodada. */
interface Serie {
  chave: string
  nome: string
  cor?: string
  opacidade?: number
}

function BarrasPorCategoria({
  dados,
  series,
  formatar,
  aoClicar,
  altura = 320,
}: {
  dados: Record<string, unknown>[]
  series: Serie[]
  formatar: (v: number) => string
  /** Drill-down: chamado com a categoria (rótulo do eixo X) da coluna clicada. */
  aoClicar?: (categoria: string) => void
  altura?: number
}) {
  return (
    <div style={{ height: altura }} className={aoClicar ? 'cursor-pointer' : undefined}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dados}
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          onClick={
            aoClicar
              ? (estado: unknown) => {
                  const rotulo = (estado as { activeLabel?: string | number } | null)?.activeLabel
                  if (rotulo !== undefined && rotulo !== null) aoClicar(String(rotulo))
                }
              : undefined
          }
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
          <XAxis dataKey="categoria" tick={tick} interval={0} angle={dados.length > 6 ? -30 : 0} textAnchor={dados.length > 6 ? 'end' : 'middle'} height={dados.length > 6 ? 80 : 30} />
          <YAxis tick={tick} tickFormatter={(v) => compacto.format(n(v))} width={56} />
          <Tooltip formatter={(v) => formatar(n(v))} />
          {series.length > 1 && <Legend />}
          {series.map((s, i) => (
            <Bar key={s.chave} dataKey={s.chave} name={s.nome} fill={s.cor ?? PALETA[i % PALETA.length]} fillOpacity={s.opacidade ?? 1} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const decimal2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface PropsRotulo {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  value?: unknown
}

/** Rótulo em destaque: etiqueta na cor da série acima da barra, ou texto vertical em negrito quando há muitas séries. */
function rotuloDestaque(cor: string, vertical: boolean) {
  return function Rotulo(p: PropsRotulo) {
    if (p.value === null || p.value === undefined || p.value === '') return null
    const x = Number(p.x ?? 0)
    const y = Number(p.y ?? 0)
    const w = Number(p.width ?? 0)
    const h = Number(p.height ?? 0)
    const texto = decimal2.format(n(p.value))
    const cx = x + w / 2
    if (!vertical) {
      const largura = texto.length * 6.8 + 12
      return (
        <g>
          <rect x={cx - largura / 2} y={y - 24} width={largura} height={19} rx={9.5} fill={cor} />
          <text x={cx} y={y - 11} textAnchor="middle" fill="#FFFFFF" fontSize={11.5} fontWeight={700}>
            {texto}
          </text>
        </g>
      )
    }
    const comprimento = texto.length * 6.4 + 8
    const dentro = h >= comprimento
    const ty = dentro ? y + 6 : y - 6
    return (
      <text
        x={cx}
        y={ty}
        transform={`rotate(-90 ${cx} ${ty})`}
        textAnchor={dentro ? 'end' : 'start'}
        dominantBaseline="central"
        fill={dentro ? '#FFFFFF' : cor}
        fontSize={11}
        fontWeight={700}
      >
        {texto}
      </text>
    )
  }
}

/** Barras verticais com o valor em destaque em cada barra; rola na horizontal quando há muitas categorias. */
function BarrasVerticaisComValores({
  dados,
  series,
  formatar,
  capturar,
}: {
  dados: Record<string, unknown>[]
  series: Serie[]
  formatar: (v: number) => string
  capturar?: (el: HTMLDivElement | null) => void
}) {
  const rotuloVertical = series.length > 2
  const larguraMinima = dados.length * (series.length * (rotuloVertical ? 30 : 68) + 24) + 80
  return (
    <div className="overflow-x-auto">
      <div style={{ height: 440, minWidth: larguraMinima }} ref={capturar} className="bg-white">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: rotuloVertical ? 64 : 32, right: 16, bottom: 4, left: 8 }} barCategoryGap="18%" barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis dataKey="categoria" tick={tick} interval={0} angle={-40} textAnchor="end" height={120} />
            <YAxis tick={tick} tickFormatter={(v) => compacto.format(n(v))} width={56} />
            <Tooltip formatter={(v) => formatar(n(v))} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            {series.length > 1 && <Legend verticalAlign="top" height={32} />}
            {series.map((s, i) => {
              const cor = s.cor ?? PALETA[i % PALETA.length]
              return (
                <Bar key={s.chave} dataKey={s.chave} name={s.nome} fill={cor} maxBarSize={56} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey={s.chave} content={rotuloDestaque(cor, rotuloVertical)} />
                </Bar>
              )
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function Dashboards() {
  const avisar = useAvisos()
  const [cenarios, setCenarios] = useState<CenarioDash[] | null>(null)
  // Filtros gravados no navegador: mantidos ao sair da opção e ao recarregar, até o usuário alterar
  const [estudosSel, setEstudosSel] = useFiltroPersistente<string[]>('comum.estudos', [])
  const [cenariosSel, setCenariosSel] = useFiltroPersistente<string[]>('comum.cenarios', [])
  const [fontesSel, setFontesSel] = useFiltroPersistente<string[]>('dashboards.fontes', [FONTE_ATUAL])
  const [produtosSel, setProdutosSel] = useFiltroPersistente<string[]>('comum.produtos', [])
  const [operacoesSel, setOperacoesSel] = useFiltroPersistente<string[]>('comum.operacoes', [])
  const [carregando, setCarregando] = useState(false)
  const [versao, setVersao] = useState(0)
  // Os dashboards já montados continuam na tela ao voltar para a opção (até recarregar a página)
  const [aplicado, setAplicado] = useState<FiltrosAplicados | null>(() => dashboardsMontados?.aplicado ?? null)
  const [listaRodadas, setListaRodadas] = useState<{ cenario_id: string; codigo: string; descricao: string | null; e_referencia: boolean | null }[]>([])
  const [listaProdutos, setListaProdutos] = useState<{ cenario_id: string; codigo: string; nome: string | null }[]>([])
  /** Só depois de carregar cenários, rodadas e produtos os filtros gravados são conferidos (e os inválidos, removidos). */
  const [filtrosProntos, setFiltrosProntos] = useState(false)
  const [qtdClientes, setQtdClientes] = useFiltroPersistente<string>('dashboards.qtdClientes', '20')
  const [dialogoExportar, setDialogoExportar] = useState(false)
  const [visoesSel, setVisoesSel] = useState<string[]>([])
  const [formato, setFormato] = useState<FormatoExportacao>('pdf')
  const [exportando, setExportando] = useState(false)
  const [ufDetalhe, setUfDetalhe] = useState<string | null>(null)
  const elementos = useRef(new Map<string, HTMLElement | null>())
  const capturar = (id: string) => (el: HTMLElement | null) => {
    elementos.current.set(id, el)
  }
  const cache = useRef(dashboardsMontados?.cache ?? new Map<string, DadosCenario>())

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('cenarios')
        .select('id, nome, estudo, unidade_medida')
        .eq('status', 'concluido')
        .is('substitui_cenario_id', null)
        .order('data_importacao', { ascending: false })
      if (error) avisar(`Não foi possível carregar os cenários: ${error.message}`, 'erro')
      setCenarios((data as CenarioDash[] | null) ?? [])
      // Listas leves só para montar os filtros de rodada e produto (os dados dos dashboards são lidos ao atualizar)
      const [rod, prod] = await Promise.all([
        supabase.from('comparativo_resultados').select('cenario_id, codigo, descricao, e_referencia').limit(10000),
        supabase.from('produtos').select('cenario_id, codigo, nome').limit(10000),
      ])
      setListaRodadas((rod.data as { cenario_id: string; codigo: string; descricao: string | null; e_referencia: boolean | null }[] | null) ?? [])
      setListaProdutos((prod.data as { cenario_id: string; codigo: string; nome: string | null }[] | null) ?? [])
      setFiltrosProntos(!error && !rod.error && !prod.error)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const opcoesEstudo = useMemo<Opcao[]>(() => {
    const estudos = [...new Set((cenarios ?? []).map(estudoDe))]
    return estudos.sort((a, b) => (a === SEM_ESTUDO ? 1 : b === SEM_ESTUDO ? -1 : a.localeCompare(b, 'pt-BR'))).map((e) => ({ id: e, rotulo: e }))
  }, [cenarios])
  const cenariosDoEstudo = useMemo(() => (cenarios ?? []).filter((c) => estudosSel.length === 0 || estudosSel.includes(estudoDe(c))), [cenarios, estudosSel])
  const nomesRepetidos = useMemo(() => {
    const cont = new Map<string, number>()
    for (const c of cenarios ?? []) cont.set(c.nome, (cont.get(c.nome) ?? 0) + 1)
    return cont
  }, [cenarios])
  const nomeCenario = (c: CenarioDash) => {
    if ((nomesRepetidos.get(c.nome) ?? 0) < 2) return c.nome
    const iguais = (cenarios ?? []).filter((x) => x.nome === c.nome)
    return `${c.nome} (${iguais.length - iguais.indexOf(c)})`
  }
  const opcoesCenario = useMemo<Opcao[]>(
    () => cenariosDoEstudo.map((c) => ({ id: c.id, rotulo: nomeCenario(c), grupo: estudoDe(c) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cenariosDoEstudo, nomesRepetidos],
  )

  useEffect(() => {
    if (!filtrosProntos) return
    setEstudosSel((sel) => (sel.every((e) => opcoesEstudo.some((o) => o.id === e)) ? sel : sel.filter((e) => opcoesEstudo.some((o) => o.id === e))))
    setCenariosSel((sel) => (sel.every((id) => cenariosDoEstudo.some((c) => c.id === id)) ? sel : sel.filter((id) => cenariosDoEstudo.some((c) => c.id === id))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cenariosDoEstudo, opcoesEstudo, filtrosProntos])

  const escolhidos = useMemo(
    () => (cenariosSel.length ? cenariosDoEstudo.filter((c) => cenariosSel.includes(c.id)) : cenariosDoEstudo),
    [cenariosDoEstudo, cenariosSel],
  )
  const escolhidosIds = escolhidos.map((c) => c.id)

  /** Lê do banco (sempre dados atuais) os cenários dos filtros escolhidos e fixa os filtros usados nos dashboards. */
  const atualizarDashboards = async () => {
    if (carregando) return
    const filtros: FiltrosAplicados = { estudos: estudosSel, ids: escolhidosIds, fontes: fontesSel, produtos: produtosSel, operacoes: operacoesSel }
    if (!filtros.ids.length) {
      avisar('Nenhum cenário corresponde aos filtros escolhidos.', 'erro')
      return
    }
    setCarregando(true)
    try {
      const novos = new Map<string, DadosCenario>()
      for (let i = 0; i < filtros.ids.length; i += 20) {
        const lote = await carregarCenarios(filtros.ids.slice(i, i + 20))
        lote.forEach((v, k) => novos.set(k, v))
      }
      cache.current = novos
      setAplicado(filtros)
      dashboardsMontados = { aplicado: filtros, cache: novos }
    } catch (e) {
      avisar(`Não foi possível carregar os dados: ${e instanceof Error ? e.message : String(e)}`, 'erro')
    } finally {
      setCarregando(false)
      setVersao((v) => v + 1)
    }
  }
  const mesmaLista = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
  const filtrosAlterados =
    !aplicado ||
    !mesmaLista(aplicado.ids, escolhidosIds) ||
    !mesmaLista(aplicado.fontes, fontesSel) ||
    !mesmaLista(aplicado.produtos, produtosSel) ||
    !mesmaLista(aplicado.operacoes, operacoesSel)
  const escolhidosAplicados = useMemo(
    () => (aplicado ? (cenarios ?? []).filter((c) => aplicado.ids.includes(c.id)) : []),
    [aplicado, cenarios],
  )

  const dadosDe = (id: string) => cache.current.get(id)

  const { opcoesFonte, opcoesProduto } = useMemo(() => {
    // Só as rodadas gravadas dos cenários que passam pelos filtros de estudo e cenário
    const ids = new Set(escolhidosIds)
    const nomePorId = new Map((cenarios ?? []).map((c) => [c.id, nomeCenario(c)]))
    const prod = new Map<string, string>()
    for (const p of listaProdutos) if (ids.has(p.cenario_id)) prod.set(p.codigo, p.nome?.trim() || p.codigo)
    // Uma opção por rodada de cada cenário filtrado, agrupada pelo nome do cenário (id = r:<cenário>|<código>)
    const rodadasFiltradas = listaRodadas
      .filter((r) => ids.has(r.cenario_id))
      .map((r) => ({
        id: idRodada(r.cenario_id, r.codigo),
        rotulo: `${r.descricao ? `${r.codigo} — ${r.descricao}` : r.codigo}${r.e_referencia ? ' (referência)' : ''}`,
        grupo: `Rodadas · ${nomePorId.get(r.cenario_id) ?? 'cenário'}`,
      }))
      .sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR') || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
    return {
      opcoesFonte: [
        { id: FONTE_ATUAL, rotulo: `${ROTULO_ATUAL} (base do cenário)`, grupo: 'Base atual' },
        ...(rodadasFiltradas.length
          ? [
              { id: 'ref', rotulo: 'Rodada de referência de cada cenário', grupo: 'Resultados gravados' },
              { id: 'todas', rotulo: 'Todas as rodadas dos cenários filtrados', grupo: 'Resultados gravados' },
              ...rodadasFiltradas,
            ]
          : []),
      ] as Opcao[],
      opcoesProduto: [...prod.entries()]
        .sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'))
        .map(([id, rotulo]) => ({ id, rotulo: rotulo === id ? id : `${rotulo} (${id})` })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolhidosIds.join(','), listaRodadas, listaProdutos, cenarios, nomesRepetidos])
  const usaResultados = (aplicado?.fontes ?? []).some((f) => f !== FONTE_ATUAL)
  const semResultado = useMemo(
    () => (usaResultados ? escolhidosAplicados.filter((c) => {
      const d = dadosDe(c.id)
      return !d || !d.rodadas.length || !d.clientes.length
    }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [escolhidosAplicados, versao],
  )

  // Remove do filtro as rodadas e produtos que não existem nos cenários escolhidos; nunca deixa a fonte vazia
  useEffect(() => {
    if (!filtrosProntos) return
    const validas = fontesSel.filter((f) => opcoesFonte.some((o) => o.id === f))
    if (validas.length !== fontesSel.length || !fontesSel.length) setFontesSel(validas.length ? validas : [FONTE_ATUAL])
    if (produtosSel.some((p) => !opcoesProduto.some((o) => o.id === p))) setProdutosSel(produtosSel.filter((p) => opcoesProduto.some((o) => o.id === p)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opcoesFonte, opcoesProduto, fontesSel, produtosSel, filtrosProntos])
  const mudarFontes = (v: string[]) => setFontesSel(v.length ? v : [FONTE_ATUAL])
  const filtrando =
    estudosSel.length > 0 || cenariosSel.length > 0 || produtosSel.length > 0 || operacoesSel.length > 0 || fontesSel.length !== 1 || fontesSel[0] !== FONTE_ATUAL
  /** Volta todos os filtros ao padrão (estudos, cenários, produtos e operações também são limpos nas Perguntas). */
  const limparFiltros = () => {
    setEstudosSel([])
    setCenariosSel([])
    setFontesSel([FONTE_ATUAL])
    setProdutosSel([])
    setOperacoesSel([])
  }

  const unidades = useMemo<Unidade[]>(() => {
    const lista: Unidade[] = []
    if (!aplicado) return lista
    const fontes = aplicado.fontes.length ? aplicado.fontes : [FONTE_ATUAL]
    const varias = fontes.length > 1 || fontes.includes('todas') || escolhidosAplicados.length === 1
    for (const c of escolhidosAplicados) {
      const d = dadosDe(c.id)
      if (!d) continue
      if (fontes.includes(FONTE_ATUAL)) {
        const rodada: Rodada = { cenario_id: c.id, codigo: ROTULO_ATUAL, descricao: 'Base de dados atual do cenário (demandas e ofertas)', e_referencia: false }
        lista.push({ chave: `${c.id}|${FONTE_ATUAL}`, cenario: c, rodada, atual: true, rotulo: varias ? `${nomeCenario(c)} · ${ROTULO_ATUAL}` : nomeCenario(c) })
      }
      if (!d.clientes.length) continue
      const escolhidas = new Map<string, Rodada>()
      if (fontes.includes('todas')) d.rodadas.forEach((r) => escolhidas.set(r.codigo, r))
      if (fontes.includes('ref')) {
        const ref = d.rodadas.filter((r) => r.e_referencia)
        ;(ref.length ? ref : d.rodadas.slice(0, 1)).forEach((r) => escolhidas.set(r.codigo, r))
      }
      d.rodadas.filter((r) => fontes.includes(idRodada(c.id, r.codigo))).forEach((r) => escolhidas.set(r.codigo, r))
      for (const r of escolhidas.values()) {
        lista.push({ chave: `${c.id}|${r.codigo}`, cenario: c, rodada: r, atual: false, rotulo: varias ? `${nomeCenario(c)} · ${r.codigo}` : nomeCenario(c) })
      }
    }
    return lista
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolhidosAplicados, aplicado, versao])

  const analise = useMemo(() => {
    const produtosAp = aplicado?.produtos ?? []
    const operacoesAp = aplicado?.operacoes ?? []
    const prodOk = (p: string | null) => produtosAp.length === 0 || (p !== null && produtosAp.includes(p))
    const opOk = (o: string | null) => operacoesAp.length === 0 || (o !== null && operacoesAp.includes(o))
    const linhas = unidades.map((u, i) => (u.atual ? analisarAtual(u, i) : analisarResultado(u, i)))
    function analisarAtual(u: Unidade, i: number) {
      const d = dadosDe(u.cenario.id)!
      const dem = d.demandas.filter((l) => prodOk(l.produto))
      const demanda = dem.reduce((s, l) => s + n(l.limite_superior), 0)
      const atendida = dem.reduce((s, l) => s + n(l.demanda_atendida), 0)
      const porUf = new Map<string, { demanda: number; atendida: number; minima: number }>()
      for (const l of dem) {
        const uf = d.ufCliente.get(l.cliente) ?? 'Sem UF'
        const g = porUf.get(uf) ?? { demanda: 0, atendida: 0, minima: 0 }
        g.demanda += n(l.limite_superior)
        g.atendida += n(l.demanda_atendida)
        g.minima += n(l.limite_inferior)
        porUf.set(uf, g)
      }
      const demCliente = new Map<string, { minima: number; atendida: number }>()
      for (const l of dem) {
        const g = demCliente.get(l.cliente) ?? { minima: 0, atendida: 0 }
        g.minima += n(l.limite_inferior)
        g.atendida += n(l.demanda_atendida)
        demCliente.set(l.cliente, g)
      }
      const porOperacao = new Map<string, number>()
      const porModal = new Map<string, number>()
      const porFornecedor = new Map<string, number>()
      const porCliente = new Map<string, { atendida: number; custo: number }>()
      const somar = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
      const nomeModal = (m: string | null) => (m ? d.nomeModal.get(m) ?? m : 'Sem modal')
      const nomeForn = (f: string | null) => (f ? d.nomeFornecedor.get(f) ?? f : 'Sem fornecedor')
      let aquisicao = 0
      let transporte = 0
      const comFluxos = d.distribuicao.length > 0 || d.transferencias.length > 0
      if (comFluxos) {
        // Logística do Resultado: cada distribuição liga uma oferta (preço) a uma base por um frete (valor por unidade)
        const ofertaPorCodigo = new Map(d.ofertas.map((o) => [o.codigo, o]))
        for (const f of d.distribuicao) {
          const o = ofertaPorCodigo.get(f.origem)
          if (o && (!prodOk(o.produto) || !opOk(o.tipo))) continue
          if (!o && (produtosAp.length || operacoesAp.length)) continue
          const v = n(f.resultado_otimizacao)
          if (v <= 0) continue
          const preco = o ? n(o.preco) : 0
          const frete = o?.tipo === 'CIF' ? 0 : f.frete ? d.valorFrete.get(f.frete) ?? 0 : 0
          aquisicao += v * preco
          transporte += v * frete
          somar(porOperacao, o?.tipo ?? 'FOB', v)
          somar(porModal, nomeModal(f.modal), v)
          somar(porFornecedor, nomeForn(o?.fornecedor ?? null), v)
          const g = porCliente.get(f.destino) ?? { atendida: 0, custo: 0 }
          g.atendida += v
          g.custo += v * (preco + frete)
          porCliente.set(f.destino, g)
        }
        if (opOk('TRANSF')) {
          for (const t of d.transferencias) {
            if (!prodOk(t.produto)) continue
            const v = n(t.resultado_otimizacao)
            if (v <= 0) continue
            transporte += v * n(t.custo_unitario)
            somar(porOperacao, 'TRANSF', v)
            somar(porModal, nomeModal(t.modal), v)
          }
        }
      } else {
        // Sem logística no Resultado: só o custo de aquisição (volume comprado × preço das ofertas)
        for (const o of d.ofertas) {
          if (!prodOk(o.produto) || !opOk(o.tipo)) continue
          const v = n(o.resultado_otimizacao)
          if (v <= 0) continue
          aquisicao += v * n(o.preco)
          somar(porOperacao, o.tipo, v)
          somar(porModal, nomeModal(o.modal), v)
          somar(porFornecedor, nomeForn(o.fornecedor), v)
        }
      }
      const total = aquisicao + transporte
      return {
        indice: i,
        unidade: u,
        demanda,
        atendida,
        atendimento: demanda > 0 ? atendida / demanda : null,
        aquisicao,
        transporte,
        passagem: 0,
        total,
        medio: atendida > 0 ? total / atendida : null,
        semLogistica: !comFluxos,
        porUf,
        demCliente,
        porCliente,
        porOperacao,
        porModal,
        porFornecedor,
      }
    }
    function analisarResultado(u: Unidade, i: number) {
      const d = dadosDe(u.cenario.id)!
      const cli = d.clientes.filter((l) => l.codigo_resultado === u.rodada.codigo && prodOk(l.codigo_produto))
      const flx = d.fluxos.filter((l) => l.codigo_resultado === u.rodada.codigo && prodOk(l.codigo_produto) && opOk(l.incoterms))
      const soma = (k: keyof LinhaCliente) => cli.reduce((s, l) => s + n(l[k]), 0)
      const demanda = soma('demanda')
      const atendida = soma('demanda_atendida')
      const total = soma('custo_total')
      const porUf = new Map<string, { demanda: number; atendida: number; minima: number }>()
      const grupoUf = (uf: string) => {
        const g = porUf.get(uf) ?? { demanda: 0, atendida: 0, minima: 0 }
        porUf.set(uf, g)
        return g
      }
      for (const l of cli) {
        const g = grupoUf(d.ufCliente.get(l.codigo_cliente) ?? 'Sem UF')
        g.demanda += n(l.demanda)
        g.atendida += n(l.demanda_atendida)
      }
      // Demanda mínima: limite inferior das demandas do cenário (vale para todas as rodadas)
      for (const l of d.demandas) {
        if (!prodOk(l.produto)) continue
        grupoUf(d.ufCliente.get(l.cliente) ?? 'Sem UF').minima += n(l.limite_inferior)
      }
      const demCliente = new Map<string, { minima: number; atendida: number }>()
      for (const l of cli) {
        const g = demCliente.get(l.codigo_cliente) ?? { minima: 0, atendida: 0 }
        g.atendida += n(l.demanda_atendida)
        demCliente.set(l.codigo_cliente, g)
      }
      for (const l of d.demandas) {
        if (!prodOk(l.produto)) continue
        const g = demCliente.get(l.cliente) ?? { minima: 0, atendida: 0 }
        g.minima += n(l.limite_inferior)
        demCliente.set(l.cliente, g)
      }
      const porCliente = new Map<string, { atendida: number; custo: number }>()
      for (const l of cli) {
        const g = porCliente.get(l.codigo_cliente) ?? { atendida: 0, custo: 0 }
        g.atendida += n(l.demanda_atendida)
        g.custo += n(l.custo_total)
        porCliente.set(l.codigo_cliente, g)
      }
      const porOperacao = new Map<string, number>()
      const porModal = new Map<string, number>()
      const porFornecedor = new Map<string, number>()
      for (const l of flx) {
        const v = n(l.resultado)
        const op = l.incoterms ?? 'Outro'
        porOperacao.set(op, (porOperacao.get(op) ?? 0) + v)
        const modal = l.codigo_modal ? d.nomeModal.get(l.codigo_modal) ?? l.codigo_modal : 'Sem modal'
        porModal.set(modal, (porModal.get(modal) ?? 0) + v)
        if (op === 'FOB' || op === 'CIF') {
          const f = l.codigo_origem ? d.nomeFornecedor.get(l.codigo_origem) ?? l.codigo_origem : 'Sem fornecedor'
          porFornecedor.set(f, (porFornecedor.get(f) ?? 0) + v)
        }
      }
      return {
        indice: i,
        unidade: u,
        demanda,
        atendida,
        atendimento: demanda > 0 ? atendida / demanda : null,
        aquisicao: soma('custo_aquisicao'),
        transporte: soma('custo_transporte'),
        passagem: soma('custo_passagem'),
        total,
        medio: atendida > 0 ? total / atendida : null,
        semLogistica: false,
        porUf,
        demCliente,
        porCliente,
        porOperacao,
        porModal,
        porFornecedor,
      }
    }
    const comCusto = linhas.filter((l) => l.total > 0)
    const menor = comCusto.length ? comCusto.reduce((a, b) => (b.total < a.total ? b : a)) : null
    const maior = comCusto.length ? comCusto.reduce((a, b) => (b.total > a.total ? b : a)) : null
    const totDemanda = linhas.reduce((s, l) => s + l.demanda, 0)
    const totAtendida = linhas.reduce((s, l) => s + l.atendida, 0)
    return { linhas, menor, maior, atendimentoMedio: totDemanda > 0 ? totAtendida / totDemanda : null }
  }, [unidades, aplicado])

  const unidadeMedida = useMemo(() => {
    const u = [...new Set(unidades.map((x) => x.cenario.unidade_medida).filter(Boolean))]
    return u.length === 1 ? (u[0] as string) : 'unid.'
  }, [unidades])

  const graficoCustos = analise.linhas.map((l) => ({ rotulo: l.unidade.rotulo, aquisicao: l.aquisicao, transporte: l.transporte, passagem: l.passagem }))
  const graficoMedio = analise.linhas.filter((l) => l.medio !== null).map((l) => ({ rotulo: l.unidade.rotulo, medio: l.medio }))
  const chavesMapa = (sel: (l: (typeof analise.linhas)[number]) => Map<string, number>) => {
    const nomes = new Set<string>()
    for (const l of analise.linhas) sel(l).forEach((_v, k) => nomes.add(k))
    return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }
  const operacoes = chavesMapa((l) => l.porOperacao)
  const graficoOperacao = analise.linhas.map((l) => ({ rotulo: l.unidade.rotulo, ...Object.fromEntries(operacoes.map((o, i) => [`k${i}`, l.porOperacao.get(o) ?? 0])) }))
  const modaisGraf = chavesMapa((l) => l.porModal)
  const graficoModal = analise.linhas.map((l) => ({ rotulo: l.unidade.rotulo, ...Object.fromEntries(modaisGraf.map((m, i) => [`k${i}`, l.porModal.get(m) ?? 0])) }))

  const linhasSerie = analise.linhas.slice(0, MAX_SERIES)
  const series = linhasSerie.map((l, i) => ({ chave: `u${i}`, nome: l.unidade.rotulo }))
  // Demanda por UF: duas barras por comparação (mínima, mais clara, e atendida)
  const linhasUf = analise.linhas.slice(0, MAX_SERIES_UF)
  const seriesUf: Serie[] = linhasUf.flatMap((l, i) => {
    const cor = PALETA[i % PALETA.length]
    const sufixo = linhasUf.length > 1 ? ` · ${l.unidade.rotulo}` : ''
    return [
      { chave: `m${i}`, nome: `Demanda mínima${sufixo}`, cor, opacidade: 0.35 },
      { chave: `a${i}`, nome: `Demanda atendida${sufixo}`, cor },
    ]
  })
  const graficoUf = useMemo(() => {
    const ufs = new Map<string, number>()
    for (const l of linhasUf) l.porUf.forEach((v, uf) => ufs.set(uf, (ufs.get(uf) ?? 0) + v.demanda + v.minima))
    return [...ufs.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([uf]) => ({
        categoria: uf,
        ...Object.fromEntries(linhasUf.flatMap((l, i) => [[`m${i}`, l.porUf.get(uf)?.minima ?? 0], [`a${i}`, l.porUf.get(uf)?.atendida ?? 0]])),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analise])
  // Drill-down do gráfico por UF: os mesmos dados (mínima e atendida) para cada cliente da UF clicada
  const graficoUfClientes = useMemo(() => {
    if (!ufDetalhe) return []
    const nomes = new Map<string, string>()
    for (const l of linhasUf) {
      const d = dadosDe(l.unidade.cenario.id)
      l.demCliente.forEach((v, cod) => {
        if ((d?.ufCliente.get(cod) ?? 'Sem UF') !== ufDetalhe || (v.minima <= 0 && v.atendida <= 0)) return
        if (!nomes.has(cod)) nomes.set(cod, d?.nomeCliente.get(cod) ?? cod)
      })
    }
    return [...nomes.entries()]
      .sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true }))
      .map(([cod, nome]) => {
        const rotulo = nome === cod ? cod : `${nome} (${cod})`
        return {
          categoria: rotulo.length > 26 ? `${rotulo.slice(0, 25)}…` : rotulo,
          nomeCompleto: rotulo,
          ...Object.fromEntries(linhasUf.flatMap((l, i) => [[`m${i}`, l.demCliente.get(cod)?.minima ?? 0], [`a${i}`, l.demCliente.get(cod)?.atendida ?? 0]])),
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analise, ufDetalhe])

  const graficoFornecedor = useMemo(() => {
    const tot = new Map<string, number>()
    for (const l of linhasSerie) l.porFornecedor.forEach((v, f) => tot.set(f, (tot.get(f) ?? 0) + v))
    return [...tot.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([f]) => ({ categoria: f.length > 22 ? `${f.slice(0, 21)}…` : f, nomeCompleto: f, ...Object.fromEntries(linhasSerie.map((l, i) => [`u${i}`, l.porFornecedor.get(f) ?? 0])) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analise])

  // Custo médio por cliente: uma barra por comparação (cenário/rodada) para cada cliente
  const graficoCliente = useMemo(() => {
    const volume = new Map<string, number>()
    const nomes = new Map<string, string>()
    for (const l of linhasSerie) {
      const d = dadosDe(l.unidade.cenario.id)
      l.porCliente.forEach((v, cod) => {
        if (v.atendida <= 0) return
        volume.set(cod, (volume.get(cod) ?? 0) + v.atendida)
        if (!nomes.has(cod)) nomes.set(cod, d?.nomeCliente.get(cod) ?? cod)
      })
    }
    const ordenados = [...volume.entries()].sort((a, b) => b[1] - a[1])
    // Os N maiores pelo volume atendido, apresentados em ordem alfabética do nome do cliente
    const escolhidosCli = (qtdClientes === 'todos' ? ordenados : ordenados.slice(0, Number(qtdClientes))).sort(([a], [b]) =>
      (nomes.get(a) ?? a).localeCompare(nomes.get(b) ?? b, 'pt-BR', { sensitivity: 'base', numeric: true }),
    )
    return {
      total: ordenados.length,
      dados: escolhidosCli.map(([cod]) => {
        const nome = nomes.get(cod) ?? cod
        const rotulo = nome === cod ? cod : `${nome} (${cod})`
        return {
          categoria: rotulo.length > 26 ? `${rotulo.slice(0, 25)}…` : rotulo,
          nomeCompleto: rotulo,
          ...Object.fromEntries(
            linhasSerie.map((l, i) => {
              const v = l.porCliente.get(cod)
              return [`u${i}`, v && v.atendida > 0 ? v.custo / v.atendida : null]
            }),
          ),
        }
      }),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analise, qtdClientes])

  const fmtMoeda = (v: number) => moeda.format(v)
  const fmtVolume = (v: number) => `${formatarNumero(v)} ${unidadeMedida}`
  const fmtMedio = (v: number) => `${moeda.format(v)}/${unidadeMedida}`

  const rotuloFonteRodada = (f: string) => {
    const [id, ...resto] = f.slice(2).split('|')
    const c = (cenarios ?? []).find((x) => x.id === id)
    return `Rodada ${resto.join('|')}${c ? ` (${nomeCenario(c)})` : ''}`
  }
  const filtrosAplicados: [string, string][] = [
    ['Estudos', aplicado?.estudos.length ? aplicado.estudos.join(', ') : 'Todos'],
    ['Cenários', escolhidosAplicados.map(nomeCenario).join(', ')],
    ['Fonte dos dados', (aplicado?.fontes ?? [FONTE_ATUAL]).map((f) => (f === FONTE_ATUAL ? ROTULO_ATUAL : f === 'ref' ? 'Rodada de referência' : f === 'todas' ? 'Todas as rodadas' : rotuloFonteRodada(f))).join(', ')],
    ['Produtos', aplicado?.produtos.length ? aplicado.produtos.join(', ') : 'Todos'],
    ['Tipos de operação (gráficos de volume)', aplicado?.operacoes.length ? aplicado.operacoes.join(', ') : 'Todos'],
  ]

  /** Todas as visões da página, com os dados de cada uma (respeitando os filtros atuais). */
  const montarVisoes = (): VisaoExportacao[] => {
    const col = (nome: string, tipo: ColunaVisao['tipo'] = 'texto'): ColunaVisao => ({ nome, tipo })
    const num = (v: unknown) => (v === null || v === undefined ? null : n(v))
    const menorTotal = analise.menor?.total ?? null
    const visoes: VisaoExportacao[] = [
      {
        id: 'indicadores',
        titulo: 'Indicadores',
        colunas: [col('Indicador'), col('Valor'), col('Detalhe')],
        linhas: [
          ['Comparações', String(analise.linhas.length), `${new Set(unidades.map((u) => u.cenario.id)).size} cenário(s) com resultados`],
          ['Menor custo total', menor ? moeda.format(menor.total) : '—', menor?.unidade.rotulo ?? ''],
          ['Maior custo total', maior ? moeda.format(maior.total) : '—', maior?.unidade.rotulo ?? ''],
          ['Atendimento da demanda', analise.atendimentoMedio === null ? '—' : percentual.format(analise.atendimentoMedio), 'Demanda atendida ÷ demanda'],
        ],
        elemento: elementos.current.get('indicadores'),
      },
      {
        id: 'custos',
        titulo: 'Custo total por cenário',
        subtitulo: 'Aquisição, transporte e passagem (R$)',
        colunas: [col('Comparação'), col('Aquisição (R$)', 'moeda'), col('Transporte (R$)', 'moeda'), col('Passagem (R$)', 'moeda'), col('Custo total (R$)', 'moeda')],
        linhas: analise.linhas.map((l) => [l.unidade.rotulo, l.aquisicao, l.transporte, l.passagem, l.total]),
        elemento: elementos.current.get('custos'),
      },
      {
        id: 'medio',
        titulo: 'Custo médio por unidade atendida',
        subtitulo: `Custo total ÷ demanda atendida (R$/${unidadeMedida})`,
        colunas: [col('Comparação'), col(`Custo médio (R$/${unidadeMedida})`, 'moeda')],
        linhas: analise.linhas.map((l) => [l.unidade.rotulo, l.medio]),
        elemento: elementos.current.get('medio'),
      },
      {
        id: 'operacao',
        titulo: 'Volume por tipo de operação',
        subtitulo: `Volume movimentado nos fluxos (${unidadeMedida})`,
        colunas: [col('Comparação'), ...operacoes.map((o) => col(o === 'TRANSF' ? 'Transferência' : o, 'numero'))],
        linhas: analise.linhas.map((l) => [l.unidade.rotulo, ...operacoes.map((o) => l.porOperacao.get(o) ?? 0)]),
        elemento: elementos.current.get('operacao'),
      },
      {
        id: 'modal',
        titulo: 'Volume por modal',
        subtitulo: `Volume movimentado nos fluxos (${unidadeMedida})`,
        colunas: [col('Comparação'), ...modaisGraf.map((m) => col(m, 'numero'))],
        linhas: analise.linhas.map((l) => [l.unidade.rotulo, ...modaisGraf.map((m) => l.porModal.get(m) ?? 0)]),
        elemento: elementos.current.get('modal'),
      },
      {
        id: 'uf',
        titulo: 'Demanda mínima e atendida por UF',
        subtitulo: `As 15 UFs com maior demanda (${unidadeMedida})`,
        colunas: [col('UF'), ...seriesUf.map((sr) => col(sr.nome, 'numero'))],
        linhas: graficoUf.map((r) => [String(r.categoria), ...seriesUf.map((sr) => num((r as Record<string, unknown>)[sr.chave]))]),
        elemento: elementos.current.get('uf'),
      },
      {
        id: 'clientes',
        titulo: 'Custo médio por cliente',
        subtitulo: `Custo total ÷ demanda atendida (R$/${unidadeMedida}) · ${qtdClientes === 'todos' ? 'todos os clientes' : `${qtdClientes} maiores clientes`} · ordem alfabética`,
        colunas: [col('Cliente'), ...series.map((sr) => col(sr.nome, 'moeda'))],
        linhas: graficoCliente.dados.map((r) => [String(r.nomeCompleto), ...series.map((sr) => num((r as Record<string, unknown>)[sr.chave]))]),
        elemento: elementos.current.get('clientes'),
      },
      {
        id: 'fornecedores',
        titulo: 'Principais fornecedores',
        subtitulo: `Os 10 fornecedores com maior volume em FOB e CIF (${unidadeMedida})`,
        colunas: [col('Fornecedor'), ...series.map((sr) => col(sr.nome, 'numero'))],
        linhas: graficoFornecedor.map((r) => [String(r.nomeCompleto), ...series.map((sr) => num((r as Record<string, unknown>)[sr.chave]))]),
        elemento: elementos.current.get('fornecedores'),
      },
      {
        id: 'comparativo',
        titulo: 'Comparativo',
        subtitulo: 'Ordenado do menor para o maior custo total',
        colunas: [
          col('Estudo'),
          col('Cenário'),
          col('Rodada'),
          col('Demanda', 'numero'),
          col('Demanda atendida', 'numero'),
          col('Atendimento', 'percentual'),
          col('Aquisição (R$)', 'moeda'),
          col('Transporte (R$)', 'moeda'),
          col('Passagem (R$)', 'moeda'),
          col('Custo total (R$)', 'moeda'),
          col(`Custo médio (R$/${unidadeMedida})`, 'moeda'),
          col('Diferença p/ menor', 'percentual'),
        ],
        linhas: [...analise.linhas]
          .sort((a, b) => a.total - b.total)
          .map((l) => [
            estudoDe(l.unidade.cenario),
            nomeCenario(l.unidade.cenario),
            l.unidade.rodada.codigo,
            l.demanda,
            l.atendida,
            l.atendimento,
            l.aquisicao,
            l.transporte,
            l.passagem,
            l.total,
            l.medio,
            menorTotal && l.total > 0 ? (l.total - menorTotal) / menorTotal : null,
          ]),
      },
    ]
    return visoes.filter((v) => v.linhas.length > 0)
  }

  const abrirExportacao = () => {
    const ids = montarVisoes().map((v) => v.id)
    setVisoesSel((sel) => {
      const validas = sel.filter((id) => ids.includes(id))
      return validas.length ? validas : ids
    })
    setDialogoExportar(true)
  }

  const exportar = async () => {
    const visoes = montarVisoes().filter((v) => visoesSel.includes(v.id))
    setExportando(true)
    try {
      await exportarDashboard({ filtros: filtrosAplicados, visoes }, formato)
      setDialogoExportar(false)
      avisar('Exportação concluída.')
    } catch (e) {
      avisar(`Não foi possível exportar: ${e instanceof Error ? e.message : String(e)}`, 'erro')
    } finally {
      setExportando(false)
    }
  }

  const temDados = analise.linhas.length > 0
  const temAtual = unidades.some((u) => u.atual)
  const atualSemLogistica = analise.linhas.some((l) => l.unidade.atual && l.semLogistica)
  const notaAtual = (texto: string) => (temAtual ? ` · ${ROTULO_ATUAL}: ${texto}` : '')
  const menor = analise.menor
  const maior = analise.maior

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="titulo-pagina">Dashboards dinâmicos</h1>
          <p className="subtitulo-pagina">Compare os resultados da otimização entre cenários e estudos.</p>
        </div>
        <button className="botao-secundario" onClick={abrirExportacao} disabled={!temDados}>
          <Download size={16} />
          Exportar
        </button>
      </div>

      <div className="cartao grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <Seletor rotulo="Estudos" todos="Todos os estudos" opcoes={opcoesEstudo} selecionados={estudosSel} aoMudar={setEstudosSel} busca />
        <Seletor rotulo="Cenários" todos="Todos os cenários" opcoes={opcoesCenario} selecionados={cenariosSel} aoMudar={setCenariosSel} busca />
        <Seletor rotulo="Rodadas / fonte dos dados" todos={ROTULO_ATUAL} opcoes={opcoesFonte} selecionados={fontesSel} aoMudar={mudarFontes} />
        <Seletor rotulo="Produtos" todos="Todos os produtos" opcoes={opcoesProduto} selecionados={produtosSel} aoMudar={setProdutosSel} />
        <Seletor rotulo="Tipo de operação" todos="Todas as operações" opcoes={OPERACOES} selecionados={operacoesSel} aoMudar={setOperacoesSel} />
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-5">
          <button className="botao-acao-rotulo" onClick={() => void atualizarDashboards()} disabled={carregando || cenarios === null || !cenarios.length}>
            {carregando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {carregando ? 'Lendo os dados…' : 'Atualizar dashboards'}
          </button>
          <span className="text-sm text-texto-secundario">
            {carregando
              ? `Lendo ${escolhidosIds.length} cenário(s)…`
              : !aplicado
                ? `Escolha os filtros e clique em Atualizar dashboards (${escolhidosIds.length} cenário(s) selecionado(s)).`
                : filtrosAlterados
                  ? 'Filtros alterados. Clique em Atualizar dashboards para aplicar.'
                  : `Dashboards atualizados com ${aplicado.ids.length} cenário(s).`}
          </span>
          {filtrando && (
            <button type="button" className="ml-auto text-sm text-texto-verde hover:underline" onClick={limparFiltros} disabled={carregando}>
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {cenarios === null ? (
        <div className="cartao py-14 text-center text-sm text-texto-secundario">Carregando cenários…</div>
      ) : cenarios.length === 0 ? (
        <div className="cartao px-6 py-14 text-center">
          <p className="font-medium text-texto-forte">Nenhum cenário disponível</p>
          <Link to="/cenarios" className="botao-acao-rotulo mt-4">Ir para Cenários</Link>
        </div>
      ) : carregando && !temDados ? (
        <div className="cartao flex items-center justify-center gap-2 py-14 text-sm text-texto-secundario">
          <Loader2 size={16} className="animate-spin text-texto-verde" /> Carregando os resultados dos cenários…
        </div>
      ) : !aplicado ? (
        <div className="cartao px-6 py-14 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF6EF] text-texto-verde">
            <LayoutDashboard size={22} />
          </span>
          <p className="mt-4 font-medium text-texto-forte">Nenhum dashboard carregado</p>
          <p className="mt-1 text-sm text-texto-secundario">Escolha estudos, cenários, a fonte dos dados (dados atuais e/ou rodadas gravadas), produtos e operação e clique em Atualizar dashboards.</p>
        </div>
      ) : !temDados ? (
        <div className="cartao px-6 py-14 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF6EF] text-texto-verde">
            <LayoutDashboard size={22} />
          </span>
          <p className="mt-4 font-medium text-texto-forte">Sem resultados para os filtros escolhidos</p>
          <p className="mt-1 text-sm text-texto-secundario">Não há dados para os cenários e a fonte escolhidos. Rodadas gravadas vêm da seção ComparativoCenarios do XML; tente “Dados atuais” ou outros cenários.</p>
        </div>
      ) : (
        <>
          {carregando && (
            <p className="flex items-center gap-2 text-sm text-texto-secundario">
              <Loader2 size={14} className="animate-spin text-texto-verde" /> Atualizando…
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" ref={capturar('indicadores')}>
            <Indicador rotulo="Comparações" valor={analise.linhas.length.toLocaleString('pt-BR')} detalhe={`${new Set(unidades.map((u) => u.cenario.id)).size} cenário(s)`} />
            <Indicador rotulo="Menor custo total" valor={menor ? moedaCompacta.format(menor.total) : '—'} detalhe={menor?.unidade.rotulo} />
            <Indicador
              rotulo="Maior custo total"
              valor={maior ? moedaCompacta.format(maior.total) : '—'}
              detalhe={maior && menor && maior !== menor ? `${maior.unidade.rotulo} · +${percentual.format((maior.total - menor.total) / menor.total)} sobre o menor` : maior?.unidade.rotulo}
            />
            <Indicador rotulo="Atendimento da demanda" valor={analise.atendimentoMedio === null ? '—' : percentual.format(analise.atendimentoMedio)} detalhe="Demanda atendida ÷ demanda, somando as comparações" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Painel titulo="Custo total por cenário" subtitulo={`Aquisição, transporte e passagem (R$)${notaAtual(atualSemLogistica ? 'cenários sem logística no Resultado têm só aquisição; reimporte o XML para trazer distribuição e transferências' : 'aquisição = volume × preço da oferta; transporte = frete FC da distribuição + custo das transferências; sem custo de passagem')}`} capturar={capturar('custos')}>
              <BarrasPorUnidade
                dados={graficoCustos}
                chaves={[
                  { chave: 'aquisicao', nome: 'Aquisição' },
                  { chave: 'transporte', nome: 'Transporte' },
                  { chave: 'passagem', nome: 'Passagem' },
                ]}
                formatar={fmtMoeda}
              />
            </Painel>
            <Painel titulo="Custo médio por unidade atendida" subtitulo={`Custo total ÷ demanda atendida (R$/${unidadeMedida})${notaAtual('(aquisição + transporte) ÷ demanda atendida')}`} capturar={capturar('medio')}>
              <BarrasPorUnidade dados={graficoMedio} chaves={[{ chave: 'medio', nome: 'Custo médio' }]} formatar={fmtMedio} />
            </Painel>
            <Painel titulo="Volume por tipo de operação" subtitulo={`Volume movimentado nos fluxos (${unidadeMedida})${notaAtual('distribuição (FOB/CIF) e transferências do Resultado')}`} capturar={capturar('operacao')}>
              <PizzasPorUnidade dados={graficoOperacao} chaves={operacoes.map((o, i) => ({ chave: `k${i}`, nome: o === 'TRANSF' ? 'Transferência' : o }))} formatar={fmtVolume} />
            </Painel>
            <Painel titulo="Volume por modal" subtitulo={`Volume movimentado nos fluxos (${unidadeMedida})${notaAtual('modal dos fluxos de distribuição e transferência')}`} capturar={capturar('modal')}>
              <PizzasPorUnidade dados={graficoModal} chaves={modaisGraf.map((m, i) => ({ chave: `k${i}`, nome: m }))} formatar={fmtVolume} />
            </Painel>
            <Painel
              titulo="Demanda mínima e atendida por UF"
              capturar={capturar('uf')}
              subtitulo={`As 15 UFs com maior demanda (${unidadeMedida}) · demanda mínima = limite inferior das demandas do cenário${analise.linhas.length > MAX_SERIES_UF ? ` · mostrando as ${MAX_SERIES_UF} primeiras comparações` : ''} · clique em uma UF para ver os clientes`}
              largo
            >
              <BarrasPorCategoria dados={graficoUf} series={seriesUf} formatar={fmtVolume} aoClicar={setUfDetalhe} />
            </Painel>
            <Painel
              titulo="Custo médio por cliente"
              subtitulo={`Custo total ÷ demanda atendida (R$/${unidadeMedida}, valores nas barras) · clientes em ordem alfabética${
                linhasSerie.length > 1 ? ' · uma barra por cenário' : ''
              }${analise.linhas.length > MAX_SERIES ? ` · mostrando as ${MAX_SERIES} primeiras comparações` : ''}${notaAtual('custo de chegada à base (preço da oferta + frete FC) ÷ volume recebido do fornecedor; bases abastecidas só por transferência não aparecem')}`}
              largo
              acoes={
                <div className="flex items-center gap-2">
                  <label htmlFor="dash-qtd-clientes" className="text-sm text-texto-secundario">Mostrar</label>
                  <select id="dash-qtd-clientes" className="campo h-9 w-auto" value={qtdClientes} onChange={(e) => setQtdClientes(e.target.value)}>
                    <option value="10">10 maiores clientes</option>
                    <option value="20">20 maiores clientes</option>
                    <option value="50">50 maiores clientes</option>
                    <option value="todos">Todos os clientes ({graficoCliente.total})</option>
                  </select>
                </div>
              }
            >
              {graficoCliente.dados.length ? (
                <BarrasVerticaisComValores dados={graficoCliente.dados} series={series} formatar={fmtMedio} capturar={capturar('clientes')} />
              ) : (
                <p className="text-sm text-texto-secundario">{atualSemLogistica && !unidades.some((u) => !u.atual) ? 'Sem logística no Resultado deste cenário: reimporte o XML para calcular o custo por cliente.' : 'Sem demanda atendida para os filtros escolhidos.'}</p>
              )}
            </Painel>
            <Painel
              titulo="Principais fornecedores"
              capturar={capturar('fornecedores')}
              subtitulo={`Os 10 fornecedores com maior volume em FOB e CIF (${unidadeMedida})${analise.linhas.length > MAX_SERIES ? ` · mostrando as ${MAX_SERIES} primeiras comparações` : ''}${notaAtual('volume distribuído a partir das ofertas')}`}
              largo
            >
              {graficoFornecedor.length ? (
                <BarrasPorCategoria dados={graficoFornecedor} series={series} formatar={fmtVolume} />
              ) : (
                <p className="text-sm text-texto-secundario">Sem fluxos FOB ou CIF para os filtros escolhidos.</p>
              )}
            </Painel>
          </div>

          <section className="cartao overflow-hidden">
            <div className="px-5 pb-3 pt-5">
              <h2 className="font-medium text-texto-forte">Comparativo</h2>
              <p className="mt-0.5 text-xs text-texto-secundario">Ordenado do menor para o maior custo total.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left text-xs font-medium uppercase tracking-wide text-texto-secundario">
                    <th scope="col" className="border-y border-divisor px-4 py-3 font-medium">Estudo</th>
                    <th scope="col" className="border-y border-divisor px-4 py-3 font-medium">Cenário</th>
                    <th scope="col" className="border-y border-divisor px-4 py-3 font-medium">Rodada</th>
                    <th scope="col" className="border-y border-divisor px-4 py-3 text-right font-medium">Demanda</th>
                    <th scope="col" className="border-y border-divisor px-4 py-3 text-right font-medium">Atendida</th>
                    <th scope="col" className="border-y border-divisor px-4 py-3 text-right font-medium">Atend.</th>
                    <th scope="col" className="border-y border-divisor px-4 py-3 text-right font-medium">Aquisição</th>
                    <th scope="col" className="border-y border-divisor px-4 py-3 text-right font-medium">Transporte</th>
                    <th scope="col" className="border-y border-divisor px-4 py-3 text-right font-medium">Custo total</th>
                    <th scope="col" className="border-y border-divisor px-4 py-3 text-right font-medium">R$/{unidadeMedida}</th>
                    <th scope="col" className="border-y border-divisor px-4 py-3 text-right font-medium">Δ menor</th>
                  </tr>
                </thead>
                <tbody>
                  {[...analise.linhas]
                    .sort((a, b) => a.total - b.total)
                    .map((l) => (
                      <tr key={l.unidade.chave} className="border-b border-divisor last:border-0">
                        <td className="px-4 py-3">{estudoDe(l.unidade.cenario)}</td>
                        <td className="px-4 py-3 font-medium text-texto-forte">{nomeCenario(l.unidade.cenario)}</td>
                        <td className="px-4 py-3" title={l.unidade.rodada.descricao ?? undefined}>
                          {l.unidade.rodada.codigo}
                          {l.unidade.rodada.e_referencia && <span className="ml-1.5 rounded bg-[#EEF6EF] px-1.5 py-0.5 text-[11px] font-medium text-texto-verde">ref.</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatarNumero(l.demanda)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatarNumero(l.atendida)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{l.atendimento === null ? '—' : percentual.format(l.atendimento)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{moedaCompacta.format(l.aquisicao)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{moedaCompacta.format(l.transporte)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-texto-forte" title={moeda.format(l.total)}>
                          {moedaCompacta.format(l.total)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{l.medio === null ? '—' : moeda.format(l.medio)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {menor && l.total > 0 ? (l === menor ? <span className="text-texto-verde">menor</span> : `+${percentual.format((l.total - menor.total) / menor.total)}`) : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {semResultado.length > 0 && (
            <p className="text-xs text-texto-secundario">
              Sem rodadas gravadas (só entram com “Dados atuais”): {semResultado.map(nomeCenario).join(', ')}.
            </p>
          )}
        </>
      )}
      <Dialogo
        aberto={Boolean(ufDetalhe)}
        titulo={`Demanda mínima e atendida · clientes de ${ufDetalhe ?? ''}`}
        aoFechar={() => setUfDetalhe(null)}
        largura="grande"
        rodape={
          <button className="botao-secundario" onClick={() => setUfDetalhe(null)}>
            Fechar
          </button>
        }
      >
        {ufDetalhe && (
          <div className="space-y-4">
            <p className="text-xs text-texto-secundario">
              {graficoUfClientes.length} cliente(s) com demanda em {ufDetalhe} ({unidadeMedida}), em ordem alfabética · mesmos filtros e comparações do gráfico por UF.
            </p>
            {graficoUfClientes.length ? (
              <>
                <div className="overflow-x-auto">
                  <div style={{ minWidth: Math.max(560, graficoUfClientes.length * (seriesUf.length * 16 + 24) + 80) }}>
                    <BarrasPorCategoria dados={graficoUfClientes} series={seriesUf} formatar={fmtVolume} altura={360} />
                  </div>
                </div>
                <div className="max-h-72 overflow-auto rounded-lg border border-divisor">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-[#F9FAFB]">
                      <tr className="text-left text-xs font-medium uppercase tracking-wide text-texto-secundario">
                        <th scope="col" className="border-b border-divisor px-3 py-2 font-medium">Cliente</th>
                        {seriesUf.map((sr) => (
                          <th key={sr.chave} scope="col" className="border-b border-divisor px-3 py-2 text-right font-medium">
                            {sr.nome}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {graficoUfClientes.map((r) => (
                        <tr key={String(r.nomeCompleto)} className="border-b border-divisor last:border-0">
                          <td className="px-3 py-2 text-texto-forte">{String(r.nomeCompleto)}</td>
                          {seriesUf.map((sr) => (
                            <td key={sr.chave} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                              {formatarNumero(n((r as Record<string, unknown>)[sr.chave]))}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-texto-secundario">Nenhum cliente com demanda nesta UF para os filtros aplicados.</p>
            )}
          </div>
        )}
      </Dialogo>
      <Dialogo
        aberto={dialogoExportar}
        titulo="Exportar dashboards"
        aoFechar={() => !exportando && setDialogoExportar(false)}
        largura="grande"
        rodape={
          <>
            <button className="botao-secundario" onClick={() => setDialogoExportar(false)} disabled={exportando}>
              Cancelar
            </button>
            <button className="botao-acao-rotulo" onClick={() => void exportar()} disabled={exportando || visoesSel.length === 0}>
              {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {exportando ? 'Exportando…' : 'Exportar'}
            </button>
          </>
        }
      >
        {dialogoExportar && (
          <div className="space-y-6">
            <fieldset>
              <div className="mb-2 flex items-center gap-3">
                <legend className="font-medium text-texto-forte">Visões</legend>
                <span className="text-xs text-texto-secundario">
                  {visoesSel.length} de {montarVisoes().length} selecionadas
                </span>
                <button type="button" className="ml-auto text-sm text-texto-verde hover:underline" onClick={() => setVisoesSel(montarVisoes().map((v) => v.id))}>
                  Marcar todas
                </button>
                <button type="button" className="text-sm text-texto-verde hover:underline" onClick={() => setVisoesSel([])}>
                  Desmarcar todas
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {montarVisoes().map((v) => (
                  <label key={v.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-divisor px-3 py-2.5 text-sm hover:bg-black/5">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-[#2E7D32]"
                      checked={visoesSel.includes(v.id)}
                      onChange={() => setVisoesSel((sel) => (sel.includes(v.id) ? sel.filter((x) => x !== v.id) : [...sel, v.id]))}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-texto-forte">{v.titulo}</span>
                      <span className="block text-xs text-texto-secundario">
                        {v.elemento ? 'Gráfico e tabela' : 'Tabela'} · {v.linhas.length} linha(s)
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 font-medium text-texto-forte">Formato</legend>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {(
                  [
                    { id: 'pdf', rotulo: 'PDF', detalhe: 'Gráficos e tabelas', Icone: FileText },
                    { id: 'docx', rotulo: 'Word', detalhe: 'Gráficos e tabelas', Icone: FileText },
                    { id: 'xlsx', rotulo: 'Excel', detalhe: 'Uma aba por visão', Icone: FileSpreadsheet },
                    { id: 'csv', rotulo: 'CSV', detalhe: 'Um arquivo por visão', Icone: Sheet },
                    { id: 'png', rotulo: 'Imagem PNG', detalhe: 'Um arquivo por gráfico', Icone: IconeImagem },
                  ] as const
                ).map(({ id, rotulo, detalhe, Icone }) => (
                  <label
                    key={id}
                    className={`flex cursor-pointer flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-sm transition ${
                      formato === id ? 'border-primaria-escura bg-[#EEF6EF]' : 'border-divisor hover:bg-black/5'
                    }`}
                  >
                    <input type="radio" name="formato-exportacao" className="sr-only" checked={formato === id} onChange={() => setFormato(id)} />
                    <span className="flex items-center gap-2 font-medium text-texto-forte">
                      <Icone size={16} className="text-texto-verde" />
                      {rotulo}
                    </span>
                    <span className="text-xs text-texto-secundario">{detalhe}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-texto-secundario">Os arquivos usam os filtros da última atualização dos dashboards (estudos, cenários, fonte dos dados, produtos e tipo de operação).</p>
          </div>
        )}
      </Dialogo>
    </div>
  )
}
