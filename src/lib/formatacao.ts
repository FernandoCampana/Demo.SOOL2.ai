const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const numeroPreciso = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })

export function ehNumero(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Converte valores numéricos que vieram como texto (ex.: "3367.7"). */
export function paraNumero(v: unknown): number | null {
  if (ehNumero(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(v.trim())) return Number(v)
  return null
}

export function formatarNumero(v: unknown): string {
  const n = paraNumero(v)
  if (n === null) return v === null || v === undefined ? '' : String(v)
  return Math.abs(n) < 1 && n !== 0 ? numeroPreciso.format(n) : numero.format(n)
}

export function formatarValor(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (paraNumero(v) !== null) return formatarNumero(v)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) return v.length > 10 ? formatarDataHora(v) : formatarData(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return ''
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Título legível a partir do nome de uma coluna (custo_total → Custo total). */
export function rotuloColuna(coluna: string): string {
  if (/[A-Z ]/.test(coluna)) return coluna
  const t = coluna.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function slug(texto: string, limite = 50): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, limite) || 'resultado'
  )
}
