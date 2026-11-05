import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Eraser, History, Loader2, RotateCw, Search, SendHorizontal, Star, Trash2, X } from 'lucide-react'
import { chamarFuncao, supabase } from '../lib/supabase'
import { formatarDataHora } from '../lib/formatacao'
import type { EspecificacaoVisual, Formato, LinhaDados, Resultado } from '../lib/tipos'
import { ResultadoPergunta } from '../componentes/ResultadoPergunta'
import { useAvisos } from '../componentes/Avisos'
import { SeletorMultiplo, type OpcaoSeletor } from '../componentes/SeletorMultiplo'
import { DialogoConfirmacao } from '../componentes/Dialogo'
import { useFiltroPersistente } from '../lib/filtros'
import { textoPergunta } from '../lib/filtrosPergunta'

interface RespostaPergunta {
  tipo: 'resultado' | 'esclarecimento'
  id: number | null
  criado_em: string
  pergunta: string
  resposta: string
  destaques?: string[]
  sql?: string
  explicacao?: string
  formato?: Formato
  visualizacao?: EspecificacaoVisual | null
  colunas?: string[]
  linhas?: LinhaDados[]
}

interface Item {
  chave: string
  pergunta: string
  estado: 'carregando' | 'ok' | 'erro' | 'esclarecimento'
  resultado?: Resultado
  mensagem?: string
  sql?: string
  salvo?: boolean
  historicoId?: number | null
  reexecutando?: boolean
}

interface RegistroHistorico {
  id: number
  usuario_id: string
  pergunta: string
  criado_em: string
  resposta: string | null
  destaques: string[] | null
  sql_gerado: string | null
  formato_resultado: Formato | null
  especificacao_visual: EspecificacaoVisual | null
  dados: { colunas: string[]; linhas: LinhaDados[] } | null
  linhas_retornadas: number | null
  cenarios_ids: string[] | null
  erro: string | null
  favorita: boolean
}

function paraResultado(r: RespostaPergunta, cenariosIds: string[] | null): Resultado {
  return {
    id: r.id,
    pergunta: r.pergunta,
    criado_em: r.criado_em,
    resposta: r.resposta,
    destaques: r.destaques ?? [],
    sql: r.sql ?? null,
    explicacao: r.explicacao,
    formato: r.formato ?? 'tabela',
    visualizacao: r.visualizacao ?? null,
    colunas: r.colunas ?? [],
    linhas: r.linhas ?? [],
    cenarios_ids: cenariosIds,
  }
}

function historicoParaResultado(h: RegistroHistorico): Resultado {
  return {
    id: h.id,
    pergunta: h.pergunta,
    criado_em: h.criado_em,
    resposta: h.resposta ?? h.erro ?? '',
    destaques: h.destaques ?? [],
    sql: h.sql_gerado,
    formato: h.formato_resultado ?? 'tabela',
    visualizacao: h.especificacao_visual,
    colunas: h.dados?.colunas ?? [],
    linhas: h.dados?.linhas ?? [],
    linhas_retornadas: h.linhas_retornadas ?? undefined,
    cenarios_ids: h.cenarios_ids,
  }
}

interface CenarioFiltro {
  id: string
  nome: string
  estudo: string | null
}

const SEM_ESTUDO = 'Sem estudo'
const estudoDe = (c: CenarioFiltro) => c.estudo?.trim() || SEM_ESTUDO
const OPERACOES: OpcaoSeletor[] = [
  { id: 'FOB', rotulo: 'FOB (retirada no fornecedor)' },
  { id: 'CIF', rotulo: 'CIF (entregue na base)' },
  { id: 'TRANSF', rotulo: 'Transferência entre bases' },
]

interface RodadaFiltro {
  cenario_id: string
  codigo: string
  descricao: string | null
  e_referencia: boolean | null
}

interface ProdutoFiltro {
  cenario_id: string
  codigo: string
  nome: string | null
}

export function Perguntas() {
  const avisar = useAvisos()
  const [cenarios, setCenarios] = useState<CenarioFiltro[]>([])
  const [temConfig, setTemConfig] = useState<boolean | null>(null)
  // Filtros gravados no navegador: mantidos ao sair da opção e ao recarregar, até o usuário alterar
  const [estudosSel, setEstudosSel] = useFiltroPersistente<string[]>('comum.estudos', [])
  const [cenariosSel, setCenariosSel] = useFiltroPersistente<string[]>('comum.cenarios', [])
  const [rodadaSel, setRodadaSel] = useFiltroPersistente<string>('perguntas.rodada', 'todas')
  const [produtosSel, setProdutosSel] = useFiltroPersistente<string[]>('comum.produtos', [])
  const [operacoesSel, setOperacoesSel] = useFiltroPersistente<string[]>('comum.operacoes', [])
  /** Só depois de carregar cenários, rodadas e produtos os filtros gravados são conferidos (e os inválidos, removidos). */
  const [filtrosProntos, setFiltrosProntos] = useState(false)
  const [rodadas, setRodadas] = useState<RodadaFiltro[]>([])
  const [produtos, setProdutos] = useState<ProdutoFiltro[]>([])
  const [texto, setTexto] = useState('')
  const [itens, setItens] = useState<Item[]>([])
  /** Aba (pergunta) em exibição quando há mais de uma pergunta na tela. */
  const [abaAtiva, setAbaAtiva] = useState<string | null>(null)
  /** Pergunta cuja resposta acabou de ser apresentada: a tela rola até o início dela. */
  const [rolarPara, setRolarPara] = useState<string | null>(null)
  const [historico, setHistorico] = useState<RegistroHistorico[]>([])
  /** Nome de quem fez cada pergunta (perfis.nome, ou o e-mail se não houver nome), por id do usuário. */
  const [nomesUsuarios, setNomesUsuarios] = useState<Map<string, string>>(new Map())
  const [busca, setBusca] = useState('')
  const [abaHistorico, setAbaHistorico] = useState<'todas' | 'favoritas'>('todas')
  const [painelHistorico, setPainelHistorico] = useState(false)
  /** Período do histórico (datas no formato aaaa-mm-dd; vazio = sem limite). */
  const [periodoDe, setPeriodoDe] = useState('')
  const [periodoAte, setPeriodoAte] = useState('')
  const [exclusao, setExclusao] = useState<{ ids: number[]; titulo: string; mensagem: string } | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  const areaResultados = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  const nomes = useMemo(() => new Map(cenarios.map((c) => [c.id, c.nome])), [cenarios])
  const nomesDe = (ids: string[] | null | undefined) => (ids ?? []).map((id) => nomes.get(id) ?? 'cenário removido')

  // Limites do período em milissegundos (início do dia "De" e fim do dia "Até", no fuso do navegador)
  const inicioPeriodo = periodoDe ? new Date(`${periodoDe}T00:00:00`).getTime() : null
  const fimPeriodo = periodoAte ? new Date(`${periodoAte}T23:59:59.999`).getTime() : null
  const noPeriodo = (iso: string) => {
    const t = new Date(iso).getTime()
    return (inicioPeriodo === null || t >= inicioPeriodo) && (fimPeriodo === null || t <= fimPeriodo)
  }

  const carregarHistorico = useCallback(async () => {
    const colunas = 'id, usuario_id, pergunta, criado_em, resposta, destaques, sql_gerado, formato_resultado, especificacao_visual, dados, linhas_retornadas, cenarios_ids, erro, favorita'
    // Sem período: as 100 mais recentes; com período: até 1.000 do período. Sempre todas as favoritas.
    let consulta = supabase.from('historico_perguntas').select(colunas).order('criado_em', { ascending: false })
    if (periodoDe) consulta = consulta.gte('criado_em', new Date(`${periodoDe}T00:00:00`).toISOString())
    if (periodoAte) consulta = consulta.lte('criado_em', new Date(`${periodoAte}T23:59:59.999`).toISOString())
    const [recentes, favoritas] = await Promise.all([
      consulta.limit(periodoDe || periodoAte ? 1000 : 100),
      supabase.from('historico_perguntas').select(colunas).eq('favorita', true).order('criado_em', { ascending: false }).limit(200),
    ])
    const mapa = new Map<number, RegistroHistorico>()
    for (const h of [...((recentes.data as RegistroHistorico[]) ?? []), ...((favoritas.data as RegistroHistorico[]) ?? [])]) mapa.set(h.id, h)
    const lista = [...mapa.values()].sort((a, b) => b.criado_em.localeCompare(a.criado_em))
    setHistorico(lista)
    const ids = [...new Set(lista.map((h) => h.usuario_id).filter(Boolean))]
    if (ids.length) {
      const { data } = await supabase.from('perfis').select('id, nome, email').in('id', ids)
      setNomesUsuarios(new Map(((data as { id: string; nome: string | null; email: string | null }[] | null) ?? []).map((u) => [u.id, u.nome?.trim() || u.email || ''])))
    }
  }, [periodoDe, periodoAte])
  const quemFez = (h: RegistroHistorico) => nomesUsuarios.get(h.usuario_id)

  useEffect(() => {
    void carregarHistorico()
  }, [carregarHistorico])

  useEffect(() => {
    void (async () => {
      const [c, cfg] = await Promise.all([
        supabase.from('cenarios').select('id, nome, estudo').eq('status', 'concluido').is('substitui_cenario_id', null).order('data_importacao', { ascending: false }),
        supabase.from('configuracoes_ia').select('id').eq('padrao', true).limit(1),
      ])
      setCenarios((c.data as CenarioFiltro[] | null) ?? [])
      const [rod, prod] = await Promise.all([
        supabase.from('comparativo_resultados').select('cenario_id, codigo, descricao, e_referencia').limit(10000),
        supabase.from('produtos').select('cenario_id, codigo, nome').limit(10000),
      ])
      setRodadas((rod.data as RodadaFiltro[] | null) ?? [])
      setProdutos((prod.data as ProdutoFiltro[] | null) ?? [])
      setTemConfig(Boolean(cfg.data?.length))
      setFiltrosProntos(!c.error && !rod.error && !prod.error)
    })()
  }, [])

  // Com abas, cada troca de aba mostra a pergunta desde o início; com uma só pergunta, rola até o fim
  useEffect(() => {
    if (rolarPara) return
    if (itens.length > 1) areaResultados.current?.scrollTo({ top: 0 })
    else fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens.length, abaAtiva])

  // Depois de apresentar uma resposta, leva a tela ao início dela (pergunta e começo do texto da resposta)
  useEffect(() => {
    if (!rolarPara) return
    const quadro = requestAnimationFrame(() => {
      document.getElementById(`resposta-${rolarPara}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setRolarPara(null)
    })
    return () => cancelAnimationFrame(quadro)
  }, [rolarPara, itens])

  // Filtros: estudos e cenários definem os cenários; rodada, produtos e operações orientam a consulta gerada pela IA
  const opcoesEstudo = useMemo<OpcaoSeletor[]>(() => {
    const estudos = [...new Set(cenarios.map(estudoDe))]
    return estudos.sort((a, b) => (a === SEM_ESTUDO ? 1 : b === SEM_ESTUDO ? -1 : a.localeCompare(b, 'pt-BR'))).map((e) => ({ id: e, rotulo: e }))
  }, [cenarios])
  const cenariosDoEstudo = useMemo(() => cenarios.filter((c) => estudosSel.length === 0 || estudosSel.includes(estudoDe(c))), [cenarios, estudosSel])
  const opcoesCenario = useMemo<OpcaoSeletor[]>(() => cenariosDoEstudo.map((c) => ({ id: c.id, rotulo: c.nome, grupo: estudoDe(c) })), [cenariosDoEstudo])
  useEffect(() => {
    if (!filtrosProntos) return
    setEstudosSel((sel) => (sel.every((e) => opcoesEstudo.some((o) => o.id === e)) ? sel : sel.filter((e) => opcoesEstudo.some((o) => o.id === e))))
    setCenariosSel((sel) => (sel.every((id) => cenariosDoEstudo.some((c) => c.id === id)) ? sel : sel.filter((id) => cenariosDoEstudo.some((c) => c.id === id))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cenariosDoEstudo, opcoesEstudo, filtrosProntos])
  const idsFiltrados = useMemo(
    () => (cenariosSel.length ? cenariosSel : estudosSel.length ? cenariosDoEstudo.map((c) => c.id) : []),
    [cenariosSel, estudosSel, cenariosDoEstudo],
  )
  // Só as rodadas gravadas dos cenários que passam pelos filtros de estudo e cenário
  // Uma opção por rodada de cada cenário filtrado (valor = <cenário>|<código>), agrupada pelo nome do cenário
  const opcoesRodada = useMemo(
    () =>
      rodadas
        .filter((r) => nomes.has(r.cenario_id) && (!idsFiltrados.length || idsFiltrados.includes(r.cenario_id)))
        .map((r) => ({
          valor: `${r.cenario_id}|${r.codigo}`,
          cenarioId: r.cenario_id,
          codigo: r.codigo,
          cenario: nomes.get(r.cenario_id) ?? '',
          rotulo: `${r.descricao ? `${r.codigo} — ${r.descricao}` : r.codigo}${r.e_referencia ? ' (referência)' : ''}`,
        }))
        .sort((a, b) => a.cenario.localeCompare(b.cenario, 'pt-BR') || a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    [rodadas, idsFiltrados, nomes],
  )
  const gruposRodada = useMemo(() => {
    // Agrupa pelo id (há cenários com o mesmo nome); o rótulo do grupo é o nome do cenário
    const mapa = new Map<string, typeof opcoesRodada>()
    for (const o of opcoesRodada) mapa.set(o.cenarioId, [...(mapa.get(o.cenarioId) ?? []), o])
    return [...mapa.entries()]
  }, [opcoesRodada])
  const opcoesProduto = useMemo<OpcaoSeletor[]>(() => {
    const mapa = new Map<string, string>()
    for (const p of produtos) if (!idsFiltrados.length || idsFiltrados.includes(p.cenario_id)) mapa.set(p.codigo, p.nome?.trim() ? `${p.nome.trim()} (${p.codigo})` : p.codigo)
    return [...mapa.entries()].sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR')).map(([id, rotulo]) => ({ id, rotulo }))
  }, [produtos, idsFiltrados])
  useEffect(() => {
    if (!filtrosProntos) return
    if (rodadaSel !== 'todas' && (rodadaSel === 'ref' ? !opcoesRodada.length : !opcoesRodada.some((o) => o.valor === rodadaSel))) setRodadaSel('todas')
    if (produtosSel.some((p) => !opcoesProduto.some((o) => o.id === p))) setProdutosSel(produtosSel.filter((p) => opcoesProduto.some((o) => o.id === p)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opcoesRodada, opcoesProduto, rodadaSel, produtosSel, filtrosProntos])
  const filtrando = estudosSel.length > 0 || cenariosSel.length > 0 || rodadaSel !== 'todas' || produtosSel.length > 0 || operacoesSel.length > 0
  const limparFiltros = () => {
    setEstudosSel([])
    setCenariosSel([])
    setRodadaSel('todas')
    setProdutosSel([])
    setOperacoesSel([])
  }

  const atualizarItem = (chave: string, mudancas: Partial<Item>) => setItens((lista) => lista.map((i) => (i.chave === chave ? { ...i, ...mudancas } : i)))

  /** Acrescenta à pergunta os filtros de rodada, produto e operação, para a IA aplicá-los (e o histórico registrá-los). */
  const comFiltros = (p: string) => {
    const partes: string[] = []
    if (rodadaSel === 'ref') partes.push('apenas a rodada de referência de cada cenário (comparativo_resultados.e_referencia)')
    else if (rodadaSel !== 'todas') {
      const o = opcoesRodada.find((x) => x.valor === rodadaSel)
      if (o) partes.push(`apenas a rodada ${o.codigo} do cenário "${o.cenario}"`)
    }
    if (produtosSel.length) partes.push(`apenas os produtos ${produtosSel.join(', ')}`)
    if (operacoesSel.length) partes.push(`apenas as operações ${operacoesSel.join(', ')}`)
    return partes.length ? `${p}\n\n[Filtros aplicados: ${partes.join('; ')}]` : p
  }

  /** Envia a pergunta à IA. Com chaveExistente, refaz a pergunta na mesma aba (executar novamente). */
  const perguntar = async (pergunta: string, chaveExistente?: string) => {
    const p = pergunta.replace(/\s*\[Filtros aplicados:[^\]]*\]\s*$/, '').trim()
    if (!p) return
    const chave = chaveExistente ?? `${Date.now()}`
    const ids = idsFiltrados.length ? idsFiltrados : null
    const conversa = itens
      .filter((i) => i.chave !== chave && i.estado === 'ok' && !i.salvo && i.resultado?.sql)
      .slice(-3)
      .map((i) => ({ pergunta: i.pergunta, sql: i.resultado!.sql, explicacao: i.resultado!.explicacao }))
    if (chaveExistente) atualizarItem(chave, { pergunta: p, estado: 'carregando', mensagem: undefined, sql: undefined, resultado: undefined, salvo: false, historicoId: undefined })
    else {
      setItens((lista) => [...lista, { chave, pergunta: p, estado: 'carregando' }])
      setTexto('')
    }
    setAbaAtiva(chave)
    const r = await chamarFuncao<RespostaPergunta & { sql?: string }>('perguntar', { pergunta: comFiltros(p), cenarios_ids: ids, conversa })
    if (!r.ok) atualizarItem(chave, { estado: 'erro', mensagem: r.erro ?? 'Erro desconhecido.', sql: r.sql })
    else if (r.tipo === 'esclarecimento') atualizarItem(chave, { estado: 'esclarecimento', mensagem: r.resposta })
    else atualizarItem(chave, { estado: 'ok', resultado: paraResultado(r, ids) })
    setRolarPara(chave)
    void carregarHistorico()
    campo.current?.focus({ preventScroll: true })
  }

  /** Executa de novo a consulta gravada da pergunta (mesmo SQL) sobre os dados atuais. */
  const reexecutar = async (item: Item) => {
    const id = item.historicoId ?? item.resultado?.id
    if (!id) return void perguntar(item.pergunta, item.chave)
    atualizarItem(item.chave, { reexecutando: true })
    const r = await chamarFuncao<RespostaPergunta>('perguntar', { reexecutar_id: id, cenarios_ids: item.resultado?.cenarios_ids ?? null })
    if (!r.ok) {
      atualizarItem(item.chave, { reexecutando: false })
      avisar(r.erro ?? 'Não foi possível executar novamente.', 'erro')
      return
    }
    atualizarItem(item.chave, { reexecutando: false, salvo: false, historicoId: r.id ?? id, resultado: paraResultado(r, item.resultado?.cenarios_ids ?? null) })
    setRolarPara(item.chave)
    void carregarHistorico()
  }

  const abrirDoHistorico = (h: RegistroHistorico) => {
    setPainelHistorico(false)
    const chave = `h${h.id}-${Date.now()}`
    if (h.erro && !h.resposta) {
      setItens((lista) => [...lista, { chave, pergunta: textoPergunta(h.pergunta), estado: 'erro', mensagem: h.erro ?? '', sql: h.sql_gerado ?? undefined, historicoId: h.id }])
    } else if (!h.sql_gerado) {
      setItens((lista) => [...lista, { chave, pergunta: textoPergunta(h.pergunta), estado: 'esclarecimento', mensagem: h.resposta ?? '' }])
    } else {
      setItens((lista) => [...lista, { chave, pergunta: textoPergunta(h.pergunta), estado: 'ok', resultado: historicoParaResultado(h), salvo: true, historicoId: h.id }])
    }
    setAbaAtiva(chave)
    setRolarPara(chave)
  }

  const alternarFavorita = async (id: number, favorita: boolean) => {
    setHistorico((h) => h.map((x) => (x.id === id ? { ...x, favorita } : x)))
    const { error } = await supabase.from('historico_perguntas').update({ favorita }).eq('id', id)
    if (error) {
      setHistorico((h) => h.map((x) => (x.id === id ? { ...x, favorita: !favorita } : x)))
      avisar(`Não foi possível ${favorita ? 'marcar como favorita' : 'desmarcar a favorita'}: ${error.message}`, 'erro')
    } else avisar(favorita ? 'Pergunta marcada como favorita.' : 'Pergunta removida das favoritas.')
  }
  const ehFavorita = (id: number | null | undefined) => Boolean(id && historico.find((h) => h.id === id)?.favorita)

  const botaoFavorita = (id: number, compacto = false) => {
    const fav = ehFavorita(id)
    return (
      <button
        type="button"
        className={compacto ? 'botao-icone mt-1' : 'botao-secundario h-8 px-3 text-xs'}
        onClick={() => void alternarFavorita(id, !fav)}
        aria-pressed={fav}
        aria-label={fav ? 'Remover das favoritas' : 'Marcar como favorita'}
        title={fav ? 'Remover das favoritas' : 'Marcar como favorita'}
      >
        <Star size={compacto ? 15 : 14} className={fav ? 'fill-[#FEBF3F] text-[#E0A21F]' : ''} />
        {!compacto && (fav ? 'Favorita' : 'Marcar como favorita')}
      </button>
    )
  }

  /** Pede confirmação para excluir uma pergunta do histórico. */
  const excluirDoHistorico = (h: RegistroHistorico) =>
    setExclusao({
      ids: [h.id],
      titulo: 'Excluir pergunta',
      mensagem: `A pergunta "${textoPergunta(h.pergunta)}" e a resposta salva serão excluídas do histórico${h.favorita ? ' (ela está entre as favoritas)' : ''}. Esta ação não pode ser desfeita.`,
    })
  /** Pede confirmação para excluir todas as perguntas exibidas no histórico (as favoritas são preservadas). */
  const excluirExibidas = () => {
    const ids = filtrados.filter((h) => !h.favorita).map((h) => h.id)
    const favoritasPreservadas = filtrados.length - ids.length
    setExclusao({
      ids,
      titulo: 'Excluir perguntas do histórico',
      mensagem: `${ids.length} pergunta(s) exibida(s) no histórico serão excluídas${favoritasPreservadas ? `; ${favoritasPreservadas} favorita(s) serão mantidas` : ''}. Esta ação não pode ser desfeita.`,
    })
  }
  const confirmarExclusao = async () => {
    if (!exclusao || excluindo) return
    setExcluindo(true)
    let excluidas = 0
    let falha = ''
    for (let i = 0; i < exclusao.ids.length; i += 200) {
      const lote = exclusao.ids.slice(i, i + 200)
      const { error } = await supabase.from('historico_perguntas').delete().in('id', lote)
      if (error) {
        falha = error.message
        break
      }
      excluidas += lote.length
    }
    setExcluindo(false)
    setExclusao(null)
    if (falha) avisar(`Não foi possível excluir: ${falha}`, 'erro')
    else avisar(excluidas === 1 ? 'Pergunta excluída do histórico.' : `${excluidas} perguntas excluídas do histórico.`)
    void carregarHistorico()
  }

  const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (podePerguntar) void perguntar(texto)
    }
  }

  const carregando = itens.some((i) => i.estado === 'carregando')
  /** Retira da tela as perguntas e respostas; o histórico salvo continua disponível. */
  const limparConversa = () => {
    setItens([])
    setAbaAtiva(null)
    setTexto('')
    campo.current?.focus()
  }
  /** Fecha uma aba; se era a aba em exibição, passa para a vizinha (a seguinte ou, na falta, a anterior). */
  const fecharAba = (chave: string) => {
    const pos = itens.findIndex((i) => i.chave === chave)
    const resto = itens.filter((i) => i.chave !== chave)
    setItens(resto)
    if (abaAtiva === chave || !resto.some((i) => i.chave === abaAtiva)) setAbaAtiva(resto[Math.min(pos, resto.length - 1)]?.chave ?? null)
  }
  const chaveAtiva = itens.some((i) => i.chave === abaAtiva) ? abaAtiva : itens[itens.length - 1]?.chave ?? null
  const comAbas = itens.length > 1
  const itensVisiveis = comAbas ? itens.filter((i) => i.chave === chaveAtiva) : itens
  const bloqueio = temConfig === false ? 'config' : cenarios.length === 0 && temConfig !== null ? 'cenarios' : null
  const podePerguntar = !bloqueio && !carregando && texto.trim().length > 0
  const favoritas = historico.filter((h) => h.favorita)
  const filtrados = historico.filter(
    (h) => (abaHistorico === 'todas' || h.favorita) && noPeriodo(h.criado_em) && textoPergunta(h.pergunta).toLowerCase().includes(busca.trim().toLowerCase()),
  )
  const filtrandoHistorico = Boolean(periodoDe || periodoAte || busca.trim())
  const excluiveis = filtrados.filter((h) => !h.favorita).length

  const listaHistorico = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="font-medium text-texto-forte">Histórico</h2>
        <button className="botao-icone lg:hidden" onClick={() => setPainelHistorico(false)} aria-label="Fechar histórico">
          <X size={18} />
        </button>
      </div>
      <div className="mx-4 mb-3 grid grid-cols-2 gap-1 rounded-lg bg-[#F3F4F6] p-1 text-sm" role="tablist" aria-label="Filtrar histórico">
        {(['todas', 'favoritas'] as const).map((aba) => (
          <button
            key={aba}
            type="button"
            role="tab"
            aria-selected={abaHistorico === aba}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition ${abaHistorico === aba ? 'bg-white font-medium text-texto-forte shadow-suave' : 'text-texto-secundario hover:text-texto-forte'}`}
            onClick={() => setAbaHistorico(aba)}
          >
            {aba === 'favoritas' && <Star size={13} className={abaHistorico === aba ? 'fill-[#FEBF3F] text-[#E0A21F]' : ''} />}
            {aba === 'todas' ? 'Todas' : `Favoritas${favoritas.length ? ` (${favoritas.length})` : ''}`}
          </button>
        ))}
      </div>
      <div className="relative px-4 pb-3">
        <Search size={15} className="pointer-events-none absolute left-7 top-1/2 -translate-y-[calc(50%+6px)] text-placeholder" />
        <input className="campo h-9 pl-9" placeholder="Buscar pergunta" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar no histórico" />
      </div>
      <fieldset className="px-4 pb-3">
        <legend className="mb-1 text-xs font-medium text-texto-secundario">Período</legend>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="campo h-8 min-w-0 flex-1 px-2 text-sm"
            value={periodoDe}
            max={periodoAte || undefined}
            onChange={(e) => setPeriodoDe(e.target.value)}
            aria-label="Perguntas a partir de"
            title="De"
          />
          <span className="text-xs text-texto-secundario">até</span>
          <input
            type="date"
            className="campo h-8 min-w-0 flex-1 px-2 text-sm"
            value={periodoAte}
            min={periodoDe || undefined}
            onChange={(e) => setPeriodoAte(e.target.value)}
            aria-label="Perguntas até"
            title="Até"
          />
        </div>
        {filtrandoHistorico && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-texto-secundario">{filtrados.length} pergunta(s)</span>
            {(periodoDe || periodoAte) && (
              <button
                type="button"
                className="text-texto-verde hover:underline"
                onClick={() => {
                  setPeriodoDe('')
                  setPeriodoAte('')
                }}
              >
                Limpar período
              </button>
            )}
            {excluiveis > 0 && (
              <button type="button" className="ml-auto inline-flex items-center gap-1 text-erro hover:underline" onClick={excluirExibidas} title="Excluir as perguntas exibidas (as favoritas são mantidas)">
                <Trash2 size={13} />
                Excluir {excluiveis}
              </button>
            )}
          </div>
        )}
      </fieldset>
      <ul className="min-h-0 flex-1 overflow-auto px-2 pb-4">
        {filtrados.length === 0 && (
          <li className="px-2 py-6 text-center text-sm text-texto-secundario">
            {abaHistorico === 'favoritas' && !filtrandoHistorico ? 'Marque perguntas com a estrela para encontrá-las aqui.' : filtrandoHistorico ? 'Nenhuma pergunta para a busca ou o período.' : historico.length ? 'Nada encontrado.' : 'As perguntas feitas aparecem aqui.'}
          </li>
        )}
        {filtrados.map((h) => (
          <li key={h.id} className="group flex items-start gap-1 rounded-lg hover:bg-black/5">
            <button className="min-w-0 flex-1 px-2 py-2 text-left" onClick={() => abrirDoHistorico(h)}>
              <span className="line-clamp-2 text-sm text-texto-forte">{textoPergunta(h.pergunta)}</span>
              <span className="mt-0.5 block text-xs text-texto-secundario">
                {formatarDataHora(h.criado_em)}
                {quemFez(h) ? ` · ${quemFez(h)}` : ''}
                {h.erro ? ', com erro' : ''}
              </span>
            </button>
            {botaoFavorita(h.id, true)}
            <button className="botao-icone mt-1 opacity-60 group-hover:opacity-100" onClick={() => excluirDoHistorico(h)} aria-label="Excluir do histórico" title="Excluir do histórico">
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-divisor bg-white px-4 py-3 sm:px-6">
          <h1 className="titulo-pagina mr-auto">Perguntas</h1>
          {itens.length > 0 && (
            <button
              className="botao-secundario h-9"
              onClick={limparConversa}
              disabled={carregando}
              title={carregando ? 'Aguarde a resposta em andamento' : 'Retirar da tela as perguntas e respostas (o histórico é mantido)'}
            >
              <Eraser size={16} />
              Limpar
            </button>
          )}
          <button className="botao-secundario h-9 lg:hidden" onClick={() => setPainelHistorico(true)}>
            <History size={16} />
            Histórico
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-divisor bg-white px-4 py-2.5 sm:px-6" role="group" aria-label="Filtros da pergunta">
          <SeletorMultiplo rotulo="Estudos" todos="Todos" opcoes={opcoesEstudo} selecionados={estudosSel} aoMudar={setEstudosSel} busca />
          <SeletorMultiplo rotulo="Cenários" todos="Todos" opcoes={opcoesCenario} selecionados={cenariosSel} aoMudar={setCenariosSel} busca />
          <label className="sr-only" htmlFor="perg-rodada">Rodada</label>
          <select
            id="perg-rodada"
            className={`campo h-9 w-auto max-w-[16rem] ${rodadaSel !== 'todas' ? 'border-primaria-escura' : ''}`}
            value={rodadaSel}
            onChange={(e) => setRodadaSel(e.target.value)}
            disabled={filtrosProntos && !opcoesRodada.length}
            title={filtrosProntos && !opcoesRodada.length ? 'Os cenários filtrados não têm rodadas gravadas' : 'Rodada'}
          >
            <option value="todas">{filtrosProntos && !opcoesRodada.length ? 'Rodada: sem rodadas gravadas' : 'Rodada: todas'}</option>
            {opcoesRodada.length > 0 && <option value="ref">Rodada: de referência de cada cenário</option>}
            {gruposRodada.map(([cenarioId, lista]) => (
              <optgroup key={cenarioId} label={lista[0]?.cenario ?? ''}>
                {lista.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    Rodada: {o.rotulo}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <SeletorMultiplo rotulo="Produtos" todos="Todos" opcoes={opcoesProduto} selecionados={produtosSel} aoMudar={setProdutosSel} />
          <SeletorMultiplo rotulo="Operação" todos="Todas" opcoes={OPERACOES} selecionados={operacoesSel} aoMudar={setOperacoesSel} />
          {filtrando && (
            <button type="button" className="text-sm text-texto-verde hover:underline" onClick={limparFiltros}>
              Limpar filtros
            </button>
          )}
        </div>

        {comAbas && (
          <div className="flex items-end gap-1 overflow-x-auto border-b border-[#9CA3AF] bg-white px-4 pt-2 sm:px-6" role="tablist" aria-label="Perguntas feitas">
            {itens.map((i, n) => {
              const ativa = i.chave === chaveAtiva
              return (
                <div
                  key={i.chave}
                  className={`group -mb-px flex max-w-[16rem] shrink-0 items-center rounded-t-lg border text-sm transition ${
                    ativa
                      ? 'border-[#9CA3AF] border-b-white bg-white font-medium text-texto-forte shadow-[0_-1px_3px_rgba(0,0,0,0.08)]'
                      : 'border-[#D1D5DB] bg-[#F3F4F6] text-texto-secundario hover:border-[#9CA3AF] hover:bg-white hover:text-texto-forte'
                  }`}
                >
                  <button type="button" role="tab" aria-selected={ativa} className="flex min-w-0 items-center gap-1.5 py-2 pl-3 pr-1 text-left" onClick={() => setAbaAtiva(i.chave)} title={i.pergunta}>
                    {i.estado === 'carregando' ? (
                      <Loader2 size={14} className="shrink-0 animate-spin text-texto-verde" />
                    ) : i.estado === 'erro' ? (
                      <AlertCircle size={14} className="shrink-0 text-erro" />
                    ) : (
                      <span className="shrink-0 text-xs text-texto-secundario">{n + 1}.</span>
                    )}
                    <span className="truncate">{i.pergunta}</span>
                  </button>
                  <button
                    type="button"
                    className="mr-1 rounded p-1 text-texto-secundario opacity-60 hover:bg-black/10 hover:opacity-100 disabled:opacity-30"
                    onClick={() => fecharAba(i.chave)}
                    disabled={i.estado === 'carregando'}
                    aria-label={`Fechar a aba ${i.pergunta}`}
                    title={i.estado === 'carregando' ? 'Aguarde a resposta' : 'Fechar aba'}
                  >
                    <X size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6" ref={areaResultados}>
          <div className="mx-auto max-w-5xl space-y-5">
            {bloqueio === 'config' && (
              <div className="rounded-xl border border-divisor bg-white p-5">
                <p className="text-texto-forte">Para fazer perguntas, configure a plataforma de IA.</p>
                <Link to="/configuracoes" className="botao-acao-rotulo mt-3">Ir para Configurações</Link>
              </div>
            )}
            {bloqueio === 'cenarios' && (
              <div className="rounded-xl border border-divisor bg-white p-5">
                <p className="text-texto-forte">Inclua pelo menos um cenário para fazer perguntas sobre ele.</p>
                <Link to="/cenarios" className="botao-acao-rotulo mt-3">Ir para Cenários</Link>
              </div>
            )}
            {itens.length === 0 && !bloqueio && (
              <div className="pt-6">
                <p className="text-lg text-texto-forte">O que você quer saber sobre os cenários?</p>
                <p className="mt-1 text-sm">Pergunte em português. Peça o formato se quiser: “em tabela”, “em gráfico de barras”, “monte um dashboard”.</p>
              </div>
            )}
            {itens.length === 0 && !bloqueio && favoritas.length > 0 && (
              <section className="pt-2" aria-labelledby="titulo-favoritas">
                <h2 id="titulo-favoritas" className="flex items-center gap-2 font-medium text-texto-forte">
                  <Star size={16} className="fill-[#FEBF3F] text-[#E0A21F]" /> Perguntas favoritas
                </h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {favoritas.slice(0, 12).map((h) => (
                    <div key={h.id} className="cartao flex flex-col gap-3 p-4">
                      <button type="button" className="text-left" onClick={() => abrirDoHistorico(h)} title="Abrir a resposta salva">
                        <span className="line-clamp-3 text-sm font-medium text-texto-forte">{textoPergunta(h.pergunta)}</span>
                        <span className="mt-1 block text-xs text-texto-secundario">
                          {formatarDataHora(h.criado_em)}
                          {quemFez(h) ? ` · ${quemFez(h)}` : ''}
                        </span>
                      </button>
                      <div className="mt-auto flex flex-wrap items-center gap-2">
                        <button type="button" className="botao-secundario h-8 px-3 text-xs" onClick={() => abrirDoHistorico(h)}>
                          Ver resposta
                        </button>
                        <button type="button" className="botao-secundario h-8 px-3 text-xs" onClick={() => void perguntar(h.pergunta)} disabled={Boolean(bloqueio) || carregando}>
                          Perguntar de novo
                        </button>
                        <span className="ml-auto">{botaoFavorita(h.id, true)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {favoritas.length > 12 && (
                  <button type="button" className="mt-2 text-sm text-texto-verde hover:underline" onClick={() => { setAbaHistorico('favoritas'); setPainelHistorico(true) }}>
                    Ver todas as {favoritas.length} favoritas
                  </button>
                )}
              </section>
            )}
            {itensVisiveis.map((i) => (
              <div key={i.chave} id={`resposta-${i.chave}`} className="scroll-mt-4" role={comAbas ? 'tabpanel' : undefined}>
                {i.estado === 'carregando' && (
                  <div className="rounded-xl border border-divisor bg-white p-5">
                    <p className="font-medium text-texto-forte">{i.pergunta}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm">
                      <Loader2 size={16} className="animate-spin text-texto-verde" /> Gerando a consulta, executando nos dados e preparando a resposta…
                    </p>
                  </div>
                )}
                {i.estado === 'ok' && i.resultado && (
                  <>
                    <ResultadoPergunta
                      resultado={i.resultado}
                      nomesCenarios={nomesDe(i.resultado.cenarios_ids)}
                      salvo={i.salvo}
                      aoReexecutar={bloqueio ? undefined : () => void reexecutar(i)}
                      reexecutando={i.reexecutando}
                    />
                    {(i.historicoId ?? i.resultado.id) && <div className="mt-2 flex justify-end">{botaoFavorita((i.historicoId ?? i.resultado.id)!)}</div>}
                  </>
                )}
                {(i.estado === 'erro' || i.estado === 'esclarecimento') && (
                  <div className={`rounded-xl border bg-white p-5 ${i.estado === 'erro' ? 'border-[#F5C6C6]' : 'border-divisor'}`}>
                    <p className="font-medium text-texto-forte">{i.pergunta}</p>
                    <p className={`mt-2 text-sm ${i.estado === 'erro' ? 'text-erro' : 'text-texto-forte'}`}>{i.mensagem}</p>
                    {i.estado === 'esclarecimento' && <p className="mt-2 text-xs text-texto-secundario">Responda no campo abaixo.</p>}
                    <button
                      type="button"
                      className="botao-secundario mt-3 h-9"
                      onClick={() => void perguntar(i.pergunta, i.chave)}
                      disabled={Boolean(bloqueio) || carregando}
                      title="Enviar a mesma pergunta de novo à IA, com os filtros atuais"
                    >
                      <RotateCw size={15} />
                      Executar novamente
                    </button>
                    {i.sql && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-texto-verde">Ver SQL gerado</summary>
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-[#F3F3F3] p-3 text-xs">{i.sql}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={fim} />
          </div>
        </div>

        <div className="border-t border-divisor bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-end gap-3">
            <label htmlFor="pergunta" className="sr-only">Pergunta</label>
            <textarea
              id="pergunta"
              ref={campo}
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={aoTeclar}
              disabled={Boolean(bloqueio)}
              placeholder="Escreva sua pergunta"
              className="campo max-h-40 min-h-[2.75rem] resize-none py-2.5 leading-snug"
              style={{ height: `${Math.min(160, 44 + Math.max(0, texto.split('\n').length - 1) * 20)}px` }}
            />
            <button className="botao-acao" onClick={() => void perguntar(texto)} disabled={!podePerguntar} aria-label="Perguntar" title="Perguntar (Enter)">
              {carregando ? <Loader2 size={20} className="animate-spin" /> : <SendHorizontal size={20} />}
            </button>
          </div>
        </div>
      </section>

      <aside className="hidden w-80 shrink-0 border-l border-divisor bg-white lg:block">{listaHistorico}</aside>
      <DialogoConfirmacao
        aberto={Boolean(exclusao)}
        titulo={exclusao?.titulo ?? ''}
        mensagem={exclusao?.mensagem ?? ''}
        rotuloConfirmar={excluindo ? 'Excluindo…' : 'Excluir'}
        perigo
        aoConfirmar={() => void confirmarExclusao()}
        aoCancelar={() => !excluindo && setExclusao(null)}
      />
      {painelHistorico && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setPainelHistorico(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="absolute inset-y-0 right-0 w-[min(22rem,90vw)] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            {listaHistorico}
          </aside>
        </div>
      )}
    </div>
  )
}
