import { useEffect, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatarData, formatarDataHora } from '../lib/formatacao'
import type { Cenario } from '../lib/tipos'
import { Dialogo } from './Dialogo'
import { useAvisos } from './Avisos'

interface Detalhes {
  produtos: { codigo: string; nome: string | null }[]
  clientes: number
  fornecedores: number
  resultados: { codigo: string; descricao: string | null; e_referencia: boolean | null }[]
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MAX_PERIODOS_LISTADOS = 60

/**
 * Rótulo do período i (índice iniciado em 0 a partir do início do horizonte, como no otimizador).
 * Mensal: "mar/2026"; semanal, quinzenal ou diária: data de início do período.
 */
function rotuloPeriodo(inicio: string | null, discretizacao: string | null, i: number): string | null {
  if (!inicio) return null
  const [a, m, d] = inicio.slice(0, 10).split('-').map(Number)
  const tipo = (discretizacao ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (tipo.startsWith('mens')) {
    const t = m - 1 + i
    return `${MESES[((t % 12) + 12) % 12]}/${a + Math.floor(t / 12)}`
  }
  const dias = tipo.startsWith('seman') ? 7 : tipo.startsWith('quinz') ? 15 : tipo.startsWith('diar') ? 1 : null
  if (dias === null) return null
  return formatarData(new Date(Date.UTC(a, m - 1, d + i * dias)).toISOString())
}

function Item({ rotulo, children, htmlFor }: { rotulo: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1 border-b border-divisor py-3 first:pt-0 last:border-0 last:pb-0 sm:grid-cols-[12rem,1fr] sm:items-baseline sm:gap-4">
      <dt className="text-texto-secundario">{htmlFor ? <label htmlFor={htmlFor}>{rotulo}</label> : rotulo}</dt>
      <dd className="min-w-0 text-texto-forte">{children}</dd>
    </div>
  )
}

function Carregando() {
  return (
    <span className="inline-flex items-center gap-2 text-texto-secundario">
      <Loader2 size={14} className="animate-spin" /> Carregando…
    </span>
  )
}

const fichas = 'inline-flex items-center rounded-md bg-[#F3F4F6] px-2 py-0.5 text-xs font-medium text-texto-forte'

interface Props {
  cenario: Cenario | null
  /** Quem incluiu o cenário pode editar nome e estudo. */
  podeEditar: boolean
  aoFechar: () => void
  aoSalvar: (c: Cenario) => void
}

/** Janela com os detalhes de um cenário (menu Detalhes, clique no nome ou duplo clique na linha). */
export function DetalhesCenario({ cenario, podeEditar, aoFechar, aoSalvar }: Props) {
  const avisar = useAvisos()
  const [dados, setDados] = useState<Detalhes | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [estudo, setEstudo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)

  useEffect(() => {
    if (!cenario) return
    setNome(cenario.nome)
    setEstudo(cenario.estudo ?? '')
    setErroSalvar(null)
  }, [cenario])

  useEffect(() => {
    if (!cenario) return
    let ativo = true
    setDados(null)
    setErro(null)
    void (async () => {
      const id = cenario.id
      const [p, cl, fo, re] = await Promise.all([
        supabase.from('produtos').select('codigo, nome').eq('cenario_id', id).order('codigo'),
        supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('cenario_id', id),
        supabase.from('fornecedores').select('id', { count: 'exact', head: true }).eq('cenario_id', id),
        supabase.from('comparativo_resultados').select('codigo, descricao, e_referencia').eq('cenario_id', id).order('codigo'),
      ])
      if (!ativo) return
      const e = p.error ?? cl.error ?? fo.error ?? re.error
      if (e) {
        setErro(e.message)
        return
      }
      setDados({
        produtos: (p.data ?? []) as Detalhes['produtos'],
        clientes: cl.count ?? 0,
        fornecedores: fo.count ?? 0,
        resultados: (re.data ?? []) as Detalhes['resultados'],
      })
    })()
    return () => {
      ativo = false
    }
    // recarrega só quando muda o cenário exibido
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cenario?.id])

  const c = cenario
  const alterado = Boolean(c) && (nome.trim() !== c!.nome || (estudo.trim() || null) !== (c!.estudo ?? null))

  const salvar = async () => {
    if (!c) return
    const novoNome = nome.trim()
    if (!novoNome) return setErroSalvar('Informe o nome do cenário.')
    setSalvando(true)
    setErroSalvar(null)
    const novoEstudo = estudo.trim() || null
    const { data, error } = await supabase.from('cenarios').update({ nome: novoNome, estudo: novoEstudo }).eq('id', c.id).select('id')
    setSalvando(false)
    if (error) return setErroSalvar(`Não foi possível salvar: ${error.message}`)
    if (!data?.length) return setErroSalvar('Não foi possível salvar: somente quem incluiu o cenário pode alterá-lo.')
    avisar('Cenário atualizado.')
    aoSalvar({ ...c, nome: novoNome, estudo: novoEstudo })
    aoFechar()
  }

  const n = c?.numero_periodos ?? 0
  const primeiro = c ? rotuloPeriodo(c.horizonte_inicio, c.discretizacao, 0) : null
  const ultimo = c && n > 0 ? rotuloPeriodo(c.horizonte_inicio, c.discretizacao, n - 1) : null
  const periodos = c && n > 0 && n <= MAX_PERIODOS_LISTADOS ? Array.from({ length: n }, (_, i) => ({ i, rotulo: rotuloPeriodo(c.horizonte_inicio, c.discretizacao, i) })) : []

  return (
    <Dialogo
      aberto={Boolean(c)}
      titulo="Detalhes do cenário"
      aoFechar={aoFechar}
      rodape={
        podeEditar ? (
          <>
            <button className="botao-secundario" onClick={aoFechar} disabled={salvando}>
              Cancelar
            </button>
            <button className="botao-acao-rotulo" onClick={() => void salvar()} disabled={salvando || !alterado || !nome.trim()}>
              {salvando && <Loader2 size={16} className="animate-spin" />}
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        ) : (
          <button className="botao-secundario" onClick={aoFechar}>
            Fechar
          </button>
        )
      }
    >
      {c && (
        <div className="space-y-4">
          {erro && <p className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-sm text-erro">Não foi possível carregar os detalhes: {erro}</p>}
          <dl className="text-sm">
            <Item rotulo="Nome" htmlFor={podeEditar ? 'detalhe-nome' : undefined}>
              {podeEditar ? (
                <input id="detalhe-nome" className="campo" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} />
              ) : (
                <span className="font-medium">{c.nome}</span>
              )}
              {c.descricao && c.descricao !== c.nome && <span className="mt-1 block text-xs text-texto-secundario">Descrição no arquivo: {c.descricao}</span>}
              <span className="mt-0.5 block text-xs text-texto-secundario">Arquivo: {c.nome_arquivo}</span>
            </Item>
            <Item rotulo="Estudo" htmlFor={podeEditar ? 'detalhe-estudo' : undefined}>
              {podeEditar ? (
                <input id="detalhe-estudo" className="campo" value={estudo} onChange={(e) => setEstudo(e.target.value)} maxLength={200} placeholder="Ex.: Planejamento de julho/2026" />
              ) : c.estudo ? (
                c.estudo
              ) : (
                <span className="text-texto-secundario">Não informado</span>
              )}
            </Item>
            <Item rotulo="Data de inclusão">
              {formatarDataHora(c.data_importacao)}
              {c.perfis?.nome && <span className="text-texto-secundario"> · por {c.perfis.nome}</span>}
            </Item>
            <Item rotulo="Última atualização">{c.atualizado_em ? formatarDataHora(c.atualizado_em) : <span className="text-texto-secundario">Nunca atualizado</span>}</Item>
            <Item rotulo="Produtos">
              {!dados ? (
                erro ? '—' : <Carregando />
              ) : dados.produtos.length === 0 ? (
                <span className="text-texto-secundario">Nenhum produto</span>
              ) : (
                <span className="flex flex-wrap gap-1.5">
                  {dados.produtos.map((p) => (
                    <span key={p.codigo} className={fichas} title={p.nome && p.nome !== p.codigo ? `Código ${p.codigo}` : undefined}>
                      {p.nome || p.codigo}
                    </span>
                  ))}
                </span>
              )}
            </Item>
            <Item rotulo="Períodos">
              {n > 0 ? (
                <>
                  <span>
                    {n.toLocaleString('pt-BR')} {n === 1 ? 'período' : 'períodos'}
                    {c.discretizacao && ` ${c.discretizacao.toLowerCase()}${n === 1 ? '' : 's'}`}
                    {primeiro && (ultimo && ultimo !== primeiro ? `, de ${primeiro} a ${ultimo}` : `, em ${primeiro}`)}
                  </span>
                  {c.horizonte_inicio && <span className="mt-0.5 block text-xs text-texto-secundario">Início do horizonte: {formatarData(c.horizonte_inicio)}</span>}
                  {periodos.length > 0 && (
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {periodos.map((p) => (
                        <span key={p.i} className={fichas}>
                          <span className="mr-1 text-texto-secundario">P{p.i}</span>
                          {p.rotulo ?? ''}
                        </span>
                      ))}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-texto-secundario">Não informado</span>
              )}
            </Item>
            <Item rotulo="Nº de clientes">{dados ? dados.clientes.toLocaleString('pt-BR') : erro ? '—' : <Carregando />}</Item>
            <Item rotulo="Nº de fornecedores">{dados ? dados.fornecedores.toLocaleString('pt-BR') : erro ? '—' : <Carregando />}</Item>
            <Item rotulo="Resultados salvos para comparativo">
              {!dados ? (
                erro ? '—' : <Carregando />
              ) : dados.resultados.length === 0 ? (
                <span className="text-texto-secundario">Nenhum resultado salvo para comparativo</span>
              ) : (
                <ul className="space-y-1.5">
                  {dados.resultados.map((r) => (
                    <li key={r.codigo} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.codigo}</span>
                      {r.descricao && <span className="text-texto-secundario">{r.descricao}</span>}
                      {r.e_referencia && <span className="rounded-md bg-[#EEF6EF] px-1.5 py-0.5 text-[11px] font-medium text-texto-verde">Referência</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Item>
          </dl>
          {erroSalvar && <p className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-sm text-erro">{erroSalvar}</p>}
          {!podeEditar && <p className="text-xs text-texto-secundario">Somente quem incluiu o cenário pode editar o nome e o estudo.</p>}
        </div>
      )}
    </Dialogo>
  )
}
