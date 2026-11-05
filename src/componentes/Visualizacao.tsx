import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatarNumero, paraNumero, rotuloColuna } from '../lib/formatacao'
import type { EspecificacaoVisual, Formato, Kpi, LinhaDados, Painel } from '../lib/tipos'

export const PALETA = ['#388E3C', '#FEBF3F', '#78C27B', '#58503F', '#A0D4A2', '#2E7D32', '#69A96C', '#BDBDBD']
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const compactoKpi = new Intl.NumberFormat('pt-BR', { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 2 })
const tick = { fill: '#757575', fontSize: 12 }

interface Props {
  formato: Formato
  especificacao: EspecificacaoVisual | null
  colunas: string[]
  linhas: LinhaDados[]
  altura?: number
}

export function colunasNumericas(colunas: string[], linhas: LinhaDados[]): string[] {
  return colunas.filter((c) => {
    const v = linhas.slice(0, 50).map((l) => l[c]).filter((x) => x !== null && x !== undefined)
    return v.length > 0 && v.every((x) => paraNumero(x) !== null)
  })
}

function comoLista(v: string[] | string | undefined | null): string[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

interface Eixos {
  x: string
  ys: string[]
  serie: string | null
}

function resolverEixos(spec: { eixo_x?: string; eixo_y?: string[] | string; serie?: string | null } | null, colunas: string[], linhas: LinhaDados[]): Eixos | null {
  if (!colunas.length || !linhas.length) return null
  const numericas = colunasNumericas(colunas, linhas)
  const x = spec?.eixo_x && colunas.includes(spec.eixo_x) ? spec.eixo_x : colunas.find((c) => !numericas.includes(c)) ?? colunas[0]
  let ys = comoLista(spec?.eixo_y).filter((c) => numericas.includes(c) && c !== x)
  const serie = spec?.serie && colunas.includes(spec.serie) && spec.serie !== x ? spec.serie : null
  if (!ys.length) ys = numericas.filter((c) => c !== x && c !== serie).slice(0, 4)
  if (!ys.length) return null
  return { x, ys, serie }
}

/** Prepara os dados do gráfico; com "serie", transforma o formato longo em colunas (uma por série). */
function dadosGrafico(eixos: Eixos, linhas: LinhaDados[]): { dados: Record<string, unknown>[]; chaves: string[] } {
  if (!eixos.serie) {
    return {
      dados: linhas.map((l) => ({ ...l, [eixos.x]: l[eixos.x] ?? '', ...Object.fromEntries(eixos.ys.map((y) => [y, paraNumero(l[y])])) })),
      chaves: eixos.ys,
    }
  }
  const y = eixos.ys[0]
  const grupos = new Map<string, Record<string, unknown>>()
  const series = new Set<string>()
  for (const l of linhas) {
    const k = String(l[eixos.x] ?? '')
    const s = String(l[eixos.serie] ?? '')
    series.add(s)
    const g = grupos.get(k) ?? { [eixos.x]: k }
    g[s] = (paraNumero(g[s]) ?? 0) + (paraNumero(l[y]) ?? 0)
    grupos.set(k, g)
  }
  return { dados: [...grupos.values()], chaves: [...series].slice(0, 8) }
}

function DicaValor({ unidade }: { unidade?: string }) {
  return (
    <Tooltip
      formatter={(v: unknown, nome: string) => [`${formatarNumero(v)}${unidade ? ` ${unidade}` : ''}`, rotuloColuna(String(nome))]}
      labelStyle={{ color: '#4A4A4A', fontWeight: 500 }}
      contentStyle={{ borderRadius: 8, borderColor: '#E3E3E3', fontSize: 13 }}
    />
  )
}

function Grafico({ tipo, spec, colunas, linhas, altura, unidade }: { tipo: string; spec: Painel | EspecificacaoVisual | null; colunas: string[]; linhas: LinhaDados[]; altura: number; unidade?: string }) {
  const eixos = resolverEixos(spec, colunas, linhas)
  if (!eixos) return <p className="text-sm text-texto-secundario">Não há colunas numéricas para montar o gráfico. Veja os dados na tabela.</p>
  const { dados, chaves } = dadosGrafico(eixos, linhas)
  const legenda = chaves.length > 1 ? <Legend formatter={(v) => <span className="text-xs text-texto">{rotuloColuna(String(v))}</span>} /> : null

  if (tipo.includes('pizza')) {
    const y = chaves[0]
    const ordenados = [...dados].sort((a, b) => (paraNumero(b[y]) ?? 0) - (paraNumero(a[y]) ?? 0))
    const principais = ordenados.slice(0, 7)
    const outros = ordenados.slice(7).reduce((s, d) => s + (paraNumero(d[y]) ?? 0), 0)
    const fatias = outros > 0 ? [...principais, { [eixos.x]: 'Outros', [y]: outros }] : principais
    return (
      <ResponsiveContainer width="100%" height={altura}>
        <PieChart>
          <Pie data={fatias} dataKey={y} nameKey={eixos.x} innerRadius="45%" outerRadius="80%" paddingAngle={1} label={(e) => String(e.name).slice(0, 18)} labelLine={false}>
            {fatias.map((_, i) => (
              <Cell key={i} fill={PALETA[i % PALETA.length]} />
            ))}
          </Pie>
          <DicaValor unidade={unidade} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (tipo.includes('dispersao')) {
    const numericas = colunasNumericas(colunas, linhas)
    const xNum = numericas.includes(eixos.x) ? eixos.x : numericas[0]
    const yNum = eixos.ys.find((c) => c !== xNum) ?? numericas[1]
    if (!xNum || !yNum) return <p className="text-sm text-texto-secundario">O gráfico de dispersão precisa de duas colunas numéricas.</p>
    const pontos = linhas.map((l) => ({ x: paraNumero(l[xNum]), y: paraNumero(l[yNum]) }))
    return (
      <ResponsiveContainer width="100%" height={altura}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="#E3E3E3" />
          <XAxis type="number" dataKey="x" name={rotuloColuna(xNum)} tick={tick} tickFormatter={(v) => compacto.format(v)} />
          <YAxis type="number" dataKey="y" name={rotuloColuna(yNum)} tick={tick} tickFormatter={(v) => compacto.format(v)} width={56} />
          <Tooltip formatter={(v: unknown) => formatarNumero(v)} />
          <Scatter data={pontos} fill="#388E3C" />
        </ScatterChart>
      </ResponsiveContainer>
    )
  }

  if (tipo.includes('linhas')) {
    return (
      <ResponsiveContainer width="100%" height={altura}>
        <LineChart data={dados} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="#E3E3E3" vertical={false} />
          <XAxis dataKey={eixos.x} tick={tick} />
          <YAxis tick={tick} tickFormatter={(v) => compacto.format(v)} width={56} />
          <DicaValor unidade={unidade} />
          {legenda}
          {chaves.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={PALETA[i % PALETA.length]} strokeWidth={2} dot={dados.length < 40} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  // barras: horizontais quando há muitas categorias, para os rótulos caberem
  const horizontal = dados.length > 8
  const alturaBarras = horizontal ? Math.max(altura, dados.length * 26 + 40) : altura
  return (
    <ResponsiveContainer width="100%" height={alturaBarras}>
      <BarChart data={dados} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke="#E3E3E3" vertical={!horizontal} horizontal={horizontal ? false : true} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={tick} tickFormatter={(v) => compacto.format(v)} />
            <YAxis type="category" dataKey={eixos.x} tick={tick} width={150} interval={0} tickFormatter={(v) => String(v).slice(0, 22)} />
          </>
        ) : (
          <>
            <XAxis dataKey={eixos.x} tick={tick} interval={0} tickFormatter={(v) => String(v).slice(0, 14)} />
            <YAxis tick={tick} tickFormatter={(v) => compacto.format(v)} width={56} />
          </>
        )}
        <DicaValor unidade={unidade} />
        {legenda}
        {chaves.map((k, i) => (
          <Bar key={k} dataKey={k} fill={PALETA[i % PALETA.length]} radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]} maxBarSize={44} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function agregar(kpi: Kpi, linhas: LinhaDados[]): number | null {
  const valores = linhas.map((l) => paraNumero(l[kpi.coluna])).filter((v): v is number => v !== null)
  const tipo = (kpi.agregacao ?? 'soma').toLowerCase()
  if (tipo.startsWith('cont') || tipo === 'count') return linhas.length
  if (!valores.length) return null
  if (tipo.startsWith('med') || tipo === 'avg' || tipo === 'mean') return valores.reduce((a, b) => a + b, 0) / valores.length
  if (tipo.startsWith('max')) return Math.max(...valores)
  if (tipo.startsWith('min')) return Math.min(...valores)
  return valores.reduce((a, b) => a + b, 0)
}

function Dashboard({ spec, colunas, linhas, altura }: { spec: EspecificacaoVisual | null; colunas: string[]; linhas: LinhaDados[]; altura: number }) {
  const numericas = colunasNumericas(colunas, linhas)
  const kpis: Kpi[] = (spec?.kpis ?? []).filter((k) => colunas.includes(k.coluna))
  const indicadores = kpis.length ? kpis : numericas.slice(0, 4).map((c) => ({ rotulo: rotuloColuna(c), coluna: c, agregacao: 'soma', unidade: spec?.unidade }))
  const paineis: Painel[] = spec?.paineis?.length ? spec.paineis : [{ titulo: spec?.titulo, tipo: 'grafico_barras', eixo_x: spec?.eixo_x, eixo_y: spec?.eixo_y, serie: spec?.serie }]
  return (
    <div className="space-y-4">
      {indicadores.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          {indicadores.map((k) => {
            const valor = agregar(k, linhas)
            const grande = valor !== null && Math.abs(valor) >= 1_000_000
            return (
              <div key={k.rotulo + k.coluna} className="min-w-0 rounded-lg border border-divisor bg-white px-4 py-3" title={grande ? `${formatarNumero(valor)}${k.unidade ? ` ${k.unidade}` : ''}` : undefined}>
                <div className="text-xs text-texto-secundario">{k.rotulo}</div>
                <div className="mt-1 break-words text-2xl font-medium tabular-nums text-texto-forte">
                  {k.unidade === 'R$' && <span className="mr-1 text-sm font-normal text-texto-secundario">R$</span>}
                  {valor === null ? '—' : grande ? compactoKpi.format(valor) : formatarNumero(valor)}
                  {k.unidade && k.unidade !== 'R$' && <span className="ml-1 text-sm font-normal text-texto-secundario">{k.unidade}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className={`grid gap-4 ${paineis.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {paineis.map((p, i) => (
          <div key={i} className="rounded-lg border border-divisor bg-white p-3">
            {p.titulo && <h4 className="mb-2 text-sm font-medium text-texto-forte">{p.titulo}</h4>}
            <Grafico tipo={p.tipo ?? 'grafico_barras'} spec={p} colunas={colunas} linhas={linhas} altura={Math.round(altura * 0.85)} unidade={spec?.unidade} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function Visualizacao({ formato, especificacao, colunas, linhas, altura = 320 }: Props) {
  const conteudo = useMemo(() => {
    if (formato === 'texto' || formato === 'tabela') return null
    if (!linhas.length) return <p className="text-sm text-texto-secundario">A consulta não retornou dados para o gráfico.</p>
    if (formato === 'dashboard') return <Dashboard spec={especificacao} colunas={colunas} linhas={linhas} altura={altura} />
    return <Grafico tipo={formato} spec={especificacao} colunas={colunas} linhas={linhas} altura={altura} unidade={especificacao?.unidade} />
  }, [formato, especificacao, colunas, linhas, altura])
  if (!conteudo) return null
  return (
    <figure className="m-0">
      {especificacao?.titulo && formato !== 'dashboard' && <figcaption className="mb-2 text-sm font-medium text-texto-forte">{especificacao.titulo}</figcaption>}
      {conteudo}
    </figure>
  )
}
