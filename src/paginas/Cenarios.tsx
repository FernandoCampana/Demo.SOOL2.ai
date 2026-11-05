import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, Check, ChevronDown, Database, FileUp, Info, Layers, MessageSquareText, MoreVertical, Plus, RefreshCw, Search, Trash2, Users, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { formatarData, formatarDataHora } from '../lib/formatacao'
import { rotuloTabela } from '../lib/rotulos'
import type { Cenario } from '../lib/tipos'
import { excluirCenario, gravarCenario, lerArquivo } from '../importacao/importador'
import type { ResultadoLeitura } from '../importacao/parser'
import { Dialogo, DialogoConfirmacao } from '../componentes/Dialogo'
import { BarraProgresso } from '../componentes/BarraProgresso'
import { MenuOpcoes } from '../componentes/MenuOpcoes'
import { DetalhesCenario } from '../componentes/DetalhesCenario'
import { useAvisos } from '../componentes/Avisos'

type Etapa =
  | { tipo: 'ocioso' }
  | { tipo: 'lendo'; percentual: number; etapa: string; alvo?: Cenario }
  | { tipo: 'confirmar'; arquivo: File; leitura: ResultadoLeitura; nome: string; estudo: string; alvo?: Cenario }
  | { tipo: 'gravando'; percentual: number; etapa: string; alvo?: Cenario }
  | { tipo: 'concluido'; nome: string; total: number; tabelas: number; atualizacao: boolean }
  | { tipo: 'erro'; titulo: string; mensagem: string }

const STATUS: Record<string, string> = { importando: 'Importando', atualizando: 'Atualizando', erro: 'Com erro' }

/** Nome sugerido para o cenário: o nome do arquivo XML, sem a extensão. */
const nomeDoArquivo = (arquivo: File) => arquivo.name.replace(/\.xml$/i, '').trim()

function CartaoResumo({ icone: Icone, rotulo, valor, detalhe }: { icone: LucideIcon; rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="cartao flex items-start gap-4 p-5">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EEF6EF] text-texto-verde">
        <Icone size={19} />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-texto-secundario">{rotulo}</p>
        <p className="mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight text-texto-forte">{valor}</p>
        {detalhe && <p className="mt-0.5 truncate text-xs text-texto-secundario">{detalhe}</p>}
      </div>
    </div>
  )
}

type CampoOrdem = 'nome' | 'estudo' | 'data' | 'unidade' | 'dono'
interface Ordem {
  campo: CampoOrdem
  direcao: 'asc' | 'desc'
}

const valorOrdem: Record<CampoOrdem, (c: Cenario) => string | null> = {
  nome: (c) => c.nome,
  estudo: (c) => c.estudo?.trim() || null,
  data: (c) => c.data_importacao,
  unidade: (c) => c.unidade_medida,
  dono: (c) => c.perfis?.nome ?? null,
}

/** Título de coluna clicável: ordena pela coluna; um novo clique inverte a ordem. */
function TituloOrdenavel({ campo, rotulo, ordem, aoOrdenar }: { campo: CampoOrdem; rotulo: string; ordem: Ordem; aoOrdenar: (c: CampoOrdem) => void }) {
  const ativo = ordem.campo === campo
  const Icone = !ativo ? ArrowUpDown : ordem.direcao === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" className="border-b border-divisor px-5 py-3 font-medium" aria-sort={ativo ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`-mx-1 inline-flex items-center gap-1.5 rounded px-1 uppercase tracking-wide transition hover:text-texto-forte ${ativo ? 'text-texto-forte' : ''}`}
        onClick={() => aoOrdenar(campo)}
        title={`Ordenar por ${rotulo.toLowerCase()}`}
      >
        {rotulo}
        <Icone size={13} className={ativo ? 'text-texto-verde' : 'opacity-40'} />
      </button>
    </th>
  )
}

interface Dono {
  id: string
  nome: string
  total: number
}

/** Filtro "Incluído por": lista quem incluiu os cenários e permite marcar vários. Nada marcado = todos. */
function FiltroDonos({ donos, selecionados, usuarioId, aoMudar }: { donos: Dono[]; selecionados: string[]; usuarioId: string; aoMudar: (ids: string[]) => void }) {
  const [aberto, setAberto] = useState(false)
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

  const rotulo =
    selecionados.length === 0
      ? 'Incluído por: todos'
      : selecionados.length === 1
        ? `Incluído por: ${donos.find((d) => d.id === selecionados[0])?.nome ?? '1 pessoa'}`
        : `Incluído por: ${selecionados.length} pessoas`
  const alternar = (id: string) => aoMudar(selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id])

  return (
    <div className="relative w-full sm:w-auto" ref={caixa}>
      <button type="button" className="botao-secundario w-full justify-between sm:w-60" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} title="Filtrar por quem incluiu o cenário">
        <span className="flex min-w-0 items-center gap-2">
          <Users size={16} className="shrink-0 text-texto-secundario" />
          <span className="truncate">{rotulo}</span>
        </span>
        <ChevronDown size={16} className="shrink-0" />
      </button>
      {aberto && (
        <div className="absolute right-0 z-30 mt-1 w-72 max-w-[90vw] rounded-lg border border-divisor bg-white py-1 shadow-elevada">
          <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-black/5" onClick={() => aoMudar([])}>
            <span className="flex h-4 w-4 items-center justify-center">{selecionados.length === 0 && <Check size={16} className="text-texto-verde" />}</span>
            Todos
          </button>
          <div className="my-1 border-t border-divisor" />
          <div className="max-h-72 overflow-auto">
            {donos.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-black/5">
                <input type="checkbox" className="h-4 w-4 accent-[#2E7D32]" checked={selecionados.includes(d.id)} onChange={() => alternar(d.id)} />
                <span className="min-w-0 flex-1 truncate text-texto-forte">
                  {d.nome}
                  {d.id === usuarioId && <span className="ml-1.5 text-xs text-texto-secundario">(você)</span>}
                </span>
                <span className="text-xs tabular-nums text-texto-secundario">{d.total}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function Cenarios() {
  const { sessao } = useSessao()
  const avisar = useAvisos()
  const [cenarios, setCenarios] = useState<Cenario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroLista, setErroLista] = useState<string | null>(null)
  const [totalPerguntas, setTotalPerguntas] = useState<number | null>(null)
  const [filtro, setFiltro] = useState('')
  const [donosSel, setDonosSel] = useState<string[]>([])
  const [ordem, setOrdem] = useState<Ordem>({ campo: 'data', direcao: 'desc' })
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'ocioso' })
  const [nomeDiferente, setNomeDiferente] = useState<{ arquivo: File; alvo: Cenario } | null>(null)
  const [paraExcluir, setParaExcluir] = useState<Cenario | null>(null)
  const [detalhes, setDetalhes] = useState<Cenario | null>(null)
  const seletor = useRef<HTMLInputElement>(null)
  const alvoAtualizacao = useRef<Cenario | undefined>(undefined)
  const usuarioId = sessao?.user.id ?? ''

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [{ data, error }, perguntas] = await Promise.all([
      supabase
        .from('cenarios')
        .select('id, nome, estudo, descricao, unidade_medida, horizonte_inicio, discretizacao, numero_periodos, nome_arquivo, data_importacao, atualizado_em, caminho_arquivo_storage, status, total_registros, usuario_id, perfis(nome)')
        .is('substitui_cenario_id', null)
        .order('data_importacao', { ascending: false }),
      supabase.from('historico_perguntas').select('id', { count: 'exact', head: true }),
    ])
    setErroLista(error ? error.message : null)
    setCenarios((data as unknown as Cenario[]) ?? [])
    setTotalPerguntas(perguntas.count ?? 0)
    setCarregando(false)
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const resumo = useMemo(() => {
    const concluidos = cenarios.filter((c) => c.status === 'concluido')
    return {
      cenarios: concluidos.length,
      registros: concluidos.reduce((s, c) => s + (c.total_registros ?? 0), 0),
      ultima: cenarios[0] ?? null,
    }
  }, [cenarios])

  const donos = useMemo<Dono[]>(() => {
    const mapa = new Map<string, Dono>()
    for (const c of cenarios) {
      const d = mapa.get(c.usuario_id) ?? { id: c.usuario_id, nome: c.perfis?.nome?.trim() || 'Sem nome', total: 0 }
      d.total += 1
      mapa.set(c.usuario_id, d)
    }
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [cenarios])

  const visiveis = useMemo(() => {
    const f = filtro.trim().toLowerCase()
    return cenarios.filter(
      (c) =>
        (donosSel.length === 0 || donosSel.includes(c.usuario_id)) &&
        (!f || [c.nome, c.estudo, c.nome_arquivo, c.unidade_medida, c.perfis?.nome, c.descricao].some((v) => v?.toLowerCase().includes(f))),
    )
  }, [cenarios, filtro, donosSel])
  const filtrando = Boolean(filtro.trim()) || donosSel.length > 0

  const ordenados = useMemo(() => {
    const ler = valorOrdem[ordem.campo]
    const fator = ordem.direcao === 'asc' ? 1 : -1
    return [...visiveis].sort((a, b) => {
      const va = ler(a)
      const vb = ler(b)
      if (!va && !vb) return 0
      if (!va) return 1
      if (!vb) return -1
      return fator * va.localeCompare(vb, 'pt-BR', { numeric: true, sensitivity: 'base' })
    })
  }, [visiveis, ordem])
  const ordenar = (campo: CampoOrdem) =>
    setOrdem((o) => (o.campo === campo ? { campo, direcao: o.direcao === 'asc' ? 'desc' : 'asc' } : { campo, direcao: campo === 'data' ? 'desc' : 'asc' }))

  const escolherArquivo = (alvo?: Cenario) => {
    alvoAtualizacao.current = alvo
    if (seletor.current) {
      seletor.current.value = ''
      seletor.current.click()
    }
  }

  const ler = async (arquivo: File, alvo?: Cenario) => {
    setEtapa({ tipo: 'lendo', percentual: 0, etapa: 'Abrindo o arquivo', alvo })
    try {
      const leitura = await lerArquivo(arquivo, (percentual, e) => setEtapa({ tipo: 'lendo', percentual, etapa: e, alvo }))
      const nome = alvo?.nome ?? (nomeDoArquivo(arquivo) || leitura.cabecalho.descricao || 'Cenário')
      setEtapa({ tipo: 'confirmar', arquivo, leitura, nome, estudo: alvo?.estudo ?? '', alvo })
    } catch (e) {
      setEtapa({ tipo: 'erro', titulo: 'Não foi possível ler o arquivo', mensagem: e instanceof Error ? e.message : String(e) })
    }
  }

  const aoEscolher = (arquivo: File | undefined) => {
    if (!arquivo) return
    const alvo = alvoAtualizacao.current
    if (!/\.xml$/i.test(arquivo.name)) {
      setEtapa({ tipo: 'erro', titulo: 'Arquivo não suportado', mensagem: 'Escolha um arquivo .xml gerado pelo otimizador.' })
      return
    }
    if (alvo && arquivo.name !== alvo.nome_arquivo) {
      setNomeDiferente({ arquivo, alvo })
      return
    }
    void ler(arquivo, alvo)
  }

  const gravar = async () => {
    if (etapa.tipo !== 'confirmar') return
    const { arquivo, leitura, nome, estudo, alvo } = etapa
    if (!nome.trim()) return
    setEtapa({ tipo: 'gravando', percentual: 0, etapa: 'Preparando', alvo })
    try {
      await gravarCenario({
        leitura,
        arquivo,
        nome: nome.trim(),
        estudo: estudo.trim(),
        usuarioId,
        substituiId: alvo?.id,
        caminhoAnterior: alvo?.caminho_arquivo_storage,
        aoProgredir: (percentual, e) => setEtapa({ tipo: 'gravando', percentual, etapa: e, alvo }),
      })
      setEtapa({
        tipo: 'concluido',
        nome: nome.trim(),
        total: leitura.total,
        tabelas: Object.values(leitura.contagens).filter((n) => n > 0).length,
        atualizacao: Boolean(alvo),
      })
      await carregar()
    } catch (e) {
      setEtapa({
        tipo: 'erro',
        titulo: alvo ? 'Não foi possível atualizar o cenário' : 'Não foi possível incluir o cenário',
        mensagem: `${e instanceof Error ? e.message : String(e)}${alvo ? ' Os dados anteriores do cenário foram mantidos.' : ''}`,
      })
      await carregar()
    }
  }

  const confirmarExclusao = async () => {
    if (!paraExcluir) return
    const c = paraExcluir
    setParaExcluir(null)
    try {
      await excluirCenario(c.id, c.caminho_arquivo_storage)
      avisar(`Cenário "${c.nome}" excluído.`)
      await carregar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro')
    }
  }

  const opcoes = (c: Cenario) => {
    const dono = c.usuario_id === usuarioId
    const dica = 'Somente quem incluiu o cenário pode alterá-lo'
    return (
      <MenuOpcoes
        gatilho={(abrir) => (
          <button className="botao-icone" onClick={abrir} aria-label={`Opções do cenário ${c.nome}`}>
            <MoreVertical size={18} />
          </button>
        )}
        itens={[
          { rotulo: 'Detalhes', icone: <Info size={16} />, aoClicar: () => setDetalhes(c) },
          { rotulo: 'Atualizar', icone: <RefreshCw size={16} />, aoClicar: () => escolherArquivo(c), desativado: !dono || c.status !== 'concluido', dica },
          { rotulo: 'Excluir', icone: <Trash2 size={16} />, aoClicar: () => setParaExcluir(c), desativado: !dono, dica, perigo: true },
        ]}
      />
    )
  }

  const selo = (c: Cenario) =>
    STATUS[c.status] ? (
      <span className={`ml-2 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium ${c.status === 'erro' ? 'bg-[#FEF2F2] text-erro' : 'bg-[#FEF6E7] text-[#92600A]'}`}>
        {STATUS[c.status]}
      </span>
    ) : null

  /** Nome do cenário clicável: abre a janela de detalhes. */
  const nomeClicavel = (c: Cenario) => (
    <button
      type="button"
      className="rounded text-left font-medium text-texto-forte underline-offset-2 transition hover:text-texto-verde hover:underline focus-visible:text-texto-verde"
      onClick={() => setDetalhes(c)}
      title="Ver detalhes do cenário"
    >
      {c.nome}
    </button>
  )

  const numero = (n: number) => (carregando ? '—' : n.toLocaleString('pt-BR'))
  const dicaDuploClique = 'Clique no nome ou duas vezes na linha para ver os detalhes'
  const confirmacaoValida = etapa.tipo === 'confirmar' && Boolean(etapa.nome.trim())
  const motivoBloqueio = etapa.tipo === 'confirmar' && !etapa.nome.trim() ? 'Informe o nome do cenário.' : ''
  const estudosExistentes = [...new Set(cenarios.map((c) => c.estudo?.trim()).filter((e): e is string => Boolean(e)))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="titulo-pagina">Cenários</h1>
          <p className="subtitulo-pagina">Arquivos XML do otimizador importados para análise.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-placeholder" />
          <input className="campo pl-9" placeholder="Filtrar por palavra" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar cenários" />
        </div>
        <FiltroDonos donos={donos} selecionados={donosSel} usuarioId={usuarioId} aoMudar={setDonosSel} />
        <button className="botao-acao-rotulo" onClick={() => escolherArquivo()}>
          <Plus size={18} />
          Incluir cenário
        </button>
        <input ref={seletor} type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={(e) => aoEscolher(e.target.files?.[0])} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoResumo icone={Layers} rotulo="Cenários disponíveis" valor={numero(resumo.cenarios)} detalhe="Prontos para perguntas" />
        <CartaoResumo icone={Database} rotulo="Registros importados" valor={numero(resumo.registros)} detalhe="Somando todos os cenários" />
        <CartaoResumo icone={MessageSquareText} rotulo="Suas perguntas" valor={totalPerguntas === null ? '—' : totalPerguntas.toLocaleString('pt-BR')} detalhe="Salvas no histórico" />
        <CartaoResumo
          icone={CalendarClock}
          rotulo="Última inclusão"
          valor={carregando ? '—' : resumo.ultima ? formatarData(resumo.ultima.data_importacao) : 'Nenhuma'}
          detalhe={resumo.ultima?.nome}
        />
      </div>

      <div>
        {erroLista && <p className="mb-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-erro">Não foi possível carregar os cenários: {erroLista}</p>}
        {carregando ? (
          <div className="cartao py-14 text-center text-sm text-texto-secundario">Carregando cenários…</div>
        ) : visiveis.length === 0 ? (
          <div className="rounded-xl border border-dashed border-borda bg-white px-6 py-14 text-center">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF6EF] text-texto-verde">
              <FileUp size={22} />
            </span>
            <p className="mt-4 font-medium text-texto-forte">{filtrando ? 'Nenhum cenário encontrado para esse filtro.' : 'Nenhum cenário ainda'}</p>
            {!filtrando && (
              <>
                <p className="mt-1 text-sm text-texto-secundario">Inclua o primeiro arquivo XML do otimizador para começar a fazer perguntas.</p>
                <button className="botao-acao-rotulo mt-5" onClick={() => escolherArquivo()}>
                  <Plus size={18} />
                  Incluir cenário
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Desktop e tablet: grade */}
            <div className="cartao hidden overflow-hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#F9FAFB] text-left text-xs font-medium uppercase tracking-wide text-texto-secundario">
                      <TituloOrdenavel campo="nome" rotulo="Nome do cenário" ordem={ordem} aoOrdenar={ordenar} />
                      <TituloOrdenavel campo="estudo" rotulo="Estudo" ordem={ordem} aoOrdenar={ordenar} />
                      <TituloOrdenavel campo="data" rotulo="Data de inclusão" ordem={ordem} aoOrdenar={ordenar} />
                      <TituloOrdenavel campo="unidade" rotulo="Unidade" ordem={ordem} aoOrdenar={ordenar} />
                      <TituloOrdenavel campo="dono" rotulo="Incluído por" ordem={ordem} aoOrdenar={ordenar} />
                      <th scope="col" className="w-12 border-b border-divisor px-3 py-3"><span className="sr-only">Opções</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenados.map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-default select-none border-b border-divisor transition last:border-0 hover:bg-[#FAFBFC]"
                        onDoubleClick={() => setDetalhes(c)}
                        title={dicaDuploClique}
                      >
                        <td className="px-5 py-4">
                          <div>
                            {nomeClicavel(c)}
                            {selo(c)}
                          </div>
                          <div className="mt-0.5 text-xs text-texto-secundario">
                            {c.nome_arquivo}
                            {c.horizonte_inicio && ` · início ${formatarData(c.horizonte_inicio)} · ${c.numero_periodos ?? '?'} períodos (${(c.discretizacao ?? '').toLowerCase()})`}
                          </div>
                        </td>
                        <td className="max-w-[16rem] px-5 py-4">
                          {c.estudo ? (
                            <span className="block truncate text-texto-forte" title={c.estudo}>
                              {c.estudo}
                            </span>
                          ) : (
                            <span className="text-placeholder">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-texto-forte">
                          {formatarDataHora(c.data_importacao)}
                          {c.atualizado_em && <div className="text-xs text-texto-secundario">Atualizado em {formatarDataHora(c.atualizado_em)}</div>}
                        </td>
                        <td className="px-5 py-4">
                          {c.unidade_medida ? <span className="rounded-md bg-[#F3F4F6] px-2 py-0.5 text-xs font-medium text-texto-forte">{c.unidade_medida}</span> : ''}
                        </td>
                        <td className="px-5 py-4">{c.perfis?.nome ?? ''}</td>
                        <td className="px-3 py-4" onDoubleClick={(e) => e.stopPropagation()}>
                          {opcoes(c)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Celular: cartões */}
            <div className="mb-3 flex items-center gap-2 md:hidden">
              <label htmlFor="ordem-celular" className="shrink-0 text-sm text-texto-secundario">Ordenar por</label>
              <select
                id="ordem-celular"
                className="campo h-9"
                value={`${ordem.campo}:${ordem.direcao}`}
                onChange={(e) => {
                  const [campo, direcao] = e.target.value.split(':') as [CampoOrdem, Ordem['direcao']]
                  setOrdem({ campo, direcao })
                }}
              >
                <option value="data:desc">Data de inclusão (mais recentes)</option>
                <option value="data:asc">Data de inclusão (mais antigos)</option>
                <option value="nome:asc">Nome (A–Z)</option>
                <option value="nome:desc">Nome (Z–A)</option>
                <option value="estudo:asc">Estudo (A–Z)</option>
                <option value="estudo:desc">Estudo (Z–A)</option>
                <option value="unidade:asc">Unidade (A–Z)</option>
                <option value="unidade:desc">Unidade (Z–A)</option>
                <option value="dono:asc">Incluído por (A–Z)</option>
                <option value="dono:desc">Incluído por (Z–A)</option>
              </select>
            </div>
            <ul className="space-y-3 md:hidden">
              {ordenados.map((c) => (
                <li key={c.id} className="cartao flex select-none items-start gap-2 p-4" onDoubleClick={() => setDetalhes(c)}>
                  <div className="min-w-0 flex-1">
                    <div>
                      {nomeClicavel(c)}
                      {selo(c)}
                    </div>
                    <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-texto-secundario">Estudo</dt>
                      <dd className="text-texto-forte">{c.estudo || '—'}</dd>
                      <dt className="text-texto-secundario">Inclusão</dt>
                      <dd className="text-texto-forte">{formatarDataHora(c.data_importacao)}</dd>
                      <dt className="text-texto-secundario">Unidade</dt>
                      <dd className="text-texto-forte">{c.unidade_medida ?? ''}</dd>
                      <dt className="text-texto-secundario">Incluído por</dt>
                      <dd className="text-texto-forte">{c.perfis?.nome ?? ''}</dd>
                    </dl>
                  </div>
                  <div onDoubleClick={(e) => e.stopPropagation()}>{opcoes(c)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <DetalhesCenario
        cenario={detalhes}
        podeEditar={Boolean(detalhes) && detalhes!.usuario_id === usuarioId}
        aoFechar={() => setDetalhes(null)}
        aoSalvar={(c) => setCenarios((lista) => lista.map((x) => (x.id === c.id ? c : x)))}
      />

      {/* Leitura do arquivo */}
      <Dialogo aberto={etapa.tipo === 'lendo'} titulo="Lendo o arquivo…" largura="pequena">
        {etapa.tipo === 'lendo' && <BarraProgresso percentual={etapa.percentual} etapa={etapa.etapa} />}
      </Dialogo>

      {/* Confirmação */}
      <Dialogo
        aberto={etapa.tipo === 'confirmar'}
        titulo={etapa.tipo === 'confirmar' && etapa.alvo ? 'Confirmar atualização' : 'Confirmar inclusão'}
        aoFechar={() => setEtapa({ tipo: 'ocioso' })}
        rodape={
          etapa.tipo === 'confirmar' && (
            <>
              {motivoBloqueio && <span className="mr-auto self-center text-sm text-erro">{motivoBloqueio}</span>}
              <button className="botao-secundario" onClick={() => setEtapa({ tipo: 'ocioso' })}>Cancelar</button>
              <button className="botao-acao-rotulo" onClick={() => void gravar()} disabled={!confirmacaoValida} title={motivoBloqueio || undefined}>
                {etapa.alvo ? 'Atualizar cenário' : 'Incluir cenário'}
              </button>
            </>
          )
        }
      >
        {etapa.tipo === 'confirmar' && (
          <div className="space-y-4">
            {etapa.alvo && (
              <p className="rounded-lg border border-[#FDE7B0] bg-[#FEF6E7] px-3 py-2 text-[#92600A]">
                Os dados de “{etapa.alvo.nome}” serão totalmente substituídos pelos deste arquivo. Se algo falhar, os dados atuais são mantidos. O nome e o estudo podem ser editados em Detalhes.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="rotulo" htmlFor="nome-cenario">Nome do cenário</label>
                <input
                  id="nome-cenario"
                  className="campo"
                  value={etapa.nome}
                  onChange={(e) => setEtapa({ ...etapa, nome: e.target.value })}
                  disabled={Boolean(etapa.alvo)}
                  maxLength={200}
                />
                {!etapa.alvo && <p className="mt-1 text-xs text-texto-secundario">Sugerido a partir do nome do arquivo. Pode ser alterado.</p>}
              </div>
              <div>
                <label className="rotulo" htmlFor="estudo-cenario">
                  Estudo <span className="font-normal text-texto-secundario">(opcional)</span>
                </label>
                <input
                  id="estudo-cenario"
                  list="estudos-existentes"
                  className="campo"
                  value={etapa.estudo}
                  onChange={(e) => setEtapa({ ...etapa, estudo: e.target.value })}
                  disabled={Boolean(etapa.alvo)}
                  maxLength={200}
                  placeholder="Ex.: Planejamento de julho/2026"
                />
                <datalist id="estudos-existentes">
                  {estudosExistentes.map((e) => (
                    <option key={e} value={e} />
                  ))}
                </datalist>
                {!etapa.alvo && (
                  <p className="mt-1 text-xs text-texto-secundario">Digite um novo estudo, escolha um existente ou deixe em branco.</p>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5">
              <dt className="text-texto-secundario">Arquivo</dt>
              <dd className="break-all text-texto-forte">{etapa.arquivo.name} ({(etapa.arquivo.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB)</dd>
              <dt className="text-texto-secundario">Descrição</dt>
              <dd className="text-texto-forte">{etapa.leitura.cabecalho.descricao ?? 'sem descrição'}</dd>
              <dt className="text-texto-secundario">Unidade</dt>
              <dd className="text-texto-forte">{etapa.leitura.cabecalho.unidade_medida ?? 'não informada'}</dd>
              <dt className="text-texto-secundario">Horizonte</dt>
              <dd className="text-texto-forte">
                {etapa.leitura.cabecalho.horizonte_inicio ? `início em ${formatarData(etapa.leitura.cabecalho.horizonte_inicio)}, ` : ''}
                {etapa.leitura.cabecalho.numero_periodos ?? '?'} períodos ({(etapa.leitura.cabecalho.discretizacao ?? '?').toLowerCase()})
              </dd>
              <dt className="text-texto-secundario">Registros</dt>
              <dd className="text-texto-forte">{etapa.leitura.total.toLocaleString('pt-BR')}</dd>
            </dl>
            <details>
              <summary className="cursor-pointer text-texto-verde hover:underline">Registros por tabela</summary>
              <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                {Object.entries(etapa.leitura.contagens)
                  .filter(([, n]) => n > 0)
                  .map(([t, n]) => (
                    <li key={t} className="flex justify-between gap-2 border-b border-divisor py-1">
                      <span>{rotuloTabela(t)}</span>
                      <span className="tabular-nums text-texto-forte">{n.toLocaleString('pt-BR')}</span>
                    </li>
                  ))}
              </ul>
            </details>
            {etapa.leitura.avisos.length > 0 && (
              <div className="rounded-lg border border-divisor p-3">
                <p className="mb-1 flex items-center gap-2 font-medium text-texto-forte">
                  <AlertTriangle size={16} className="text-[#B7791F]" /> Avisos
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  {etapa.leitura.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Dialogo>

      {/* Gravação */}
      <Dialogo aberto={etapa.tipo === 'gravando'} titulo="Aguardando carregamento…" largura="pequena">
        {etapa.tipo === 'gravando' && (
          <div className="space-y-3">
            <p>{etapa.alvo ? `Atualizando “${etapa.alvo.nome}”.` : 'Gravando o cenário no banco de dados.'} Mantenha esta janela aberta até o fim.</p>
            <BarraProgresso percentual={etapa.percentual} etapa={etapa.etapa} />
          </div>
        )}
      </Dialogo>

      {/* Concluído */}
      <Dialogo
        aberto={etapa.tipo === 'concluido'}
        titulo={etapa.tipo === 'concluido' && etapa.atualizacao ? 'Cenário atualizado' : 'Cenário incluído'}
        aoFechar={() => setEtapa({ tipo: 'ocioso' })}
        largura="pequena"
        rodape={
          <>
            <button className="botao-secundario" onClick={() => setEtapa({ tipo: 'ocioso' })}>Fechar</button>
            <Link to="/perguntas" className="botao-acao-rotulo">Fazer uma pergunta</Link>
          </>
        }
      >
        {etapa.tipo === 'concluido' && (
          <p>
            “{etapa.nome}” está pronto: {etapa.total.toLocaleString('pt-BR')} registros gravados em {etapa.tabelas} tabelas.
          </p>
        )}
      </Dialogo>

      {/* Erro */}
      <Dialogo
        aberto={etapa.tipo === 'erro'}
        titulo={etapa.tipo === 'erro' ? etapa.titulo : ''}
        aoFechar={() => setEtapa({ tipo: 'ocioso' })}
        largura="pequena"
        rodape={<button className="botao-secundario" onClick={() => setEtapa({ tipo: 'ocioso' })}>Fechar</button>}
      >
        {etapa.tipo === 'erro' && <p className="text-texto-forte">{etapa.mensagem}</p>}
      </Dialogo>

      <DialogoConfirmacao
        aberto={Boolean(nomeDiferente)}
        titulo="Arquivo com outro nome"
        mensagem={
          nomeDiferente && (
            <p>
              O cenário foi incluído a partir de “{nomeDiferente.alvo.nome_arquivo}”, mas o arquivo escolhido é “{nomeDiferente.arquivo.name}”. Usar este arquivo mesmo assim?
            </p>
          )
        }
        rotuloConfirmar="Usar este arquivo"
        aoCancelar={() => setNomeDiferente(null)}
        aoConfirmar={() => {
          const n = nomeDiferente!
          setNomeDiferente(null)
          void ler(n.arquivo, n.alvo)
        }}
      />

      <DialogoConfirmacao
        aberto={Boolean(paraExcluir)}
        titulo="Excluir cenário"
        perigo
        mensagem={paraExcluir && <p>O cenário “{paraExcluir.nome}” e todos os seus dados serão removidos. Essa ação não pode ser desfeita.</p>}
        rotuloConfirmar="Excluir"
        aoCancelar={() => setParaExcluir(null)}
        aoConfirmar={() => void confirmarExclusao()}
      />
    </div>
  )
}
