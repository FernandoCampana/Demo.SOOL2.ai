import { useRef, useState } from 'react'
import { Code2, Copy, Download, FileSpreadsheet, FileText, FileType2, Image, Maximize2, RotateCw, Sheet } from 'lucide-react'
import { Dialogo } from './Dialogo'
import { MenuOpcoes } from './MenuOpcoes'
import { TabelaDados } from './TabelaDados'
import { Visualizacao } from './Visualizacao'
import { useAvisos } from './Avisos'
import { copiar, exportarCsv, exportarDocx, exportarPdf, exportarPng, exportarTxt, exportarXlsx, type ConteudoExportacao } from '../lib/exportar'
import { formatarDataHora } from '../lib/formatacao'
import { descreverFiltros, textoPergunta } from '../lib/filtrosPergunta'
import type { Formato, Resultado } from '../lib/tipos'

const FORMATOS: { valor: Formato; rotulo: string }[] = [
  { valor: 'texto', rotulo: 'Texto' },
  { valor: 'tabela', rotulo: 'Tabela' },
  { valor: 'grafico_barras', rotulo: 'Gráfico de barras' },
  { valor: 'grafico_linhas', rotulo: 'Gráfico de linhas' },
  { valor: 'grafico_pizza', rotulo: 'Gráfico de pizza' },
  { valor: 'grafico_dispersao', rotulo: 'Dispersão' },
  { valor: 'dashboard', rotulo: 'Dashboard' },
]

interface Props {
  resultado: Resultado
  nomesCenarios: string[]
  salvo?: boolean
  aoReexecutar?: () => void
  reexecutando?: boolean
}

export function ResultadoPergunta({ resultado, nomesCenarios, salvo, aoReexecutar, reexecutando }: Props) {
  const [formato, setFormato] = useState<Formato>(resultado.formato)
  const [verSql, setVerSql] = useState(false)
  const [janela, setJanela] = useState(false)
  const [exportando, setExportando] = useState(false)
  const visual = useRef<HTMLDivElement>(null)
  const visualJanela = useRef<HTMLDivElement>(null)
  const avisar = useAvisos()
  const temGrafico = formato !== 'texto' && formato !== 'tabela' && resultado.linhas.length > 0
  // Filtros usados quando a pergunta foi feita (gravados junto com a pergunta e a consulta)
  const titulo = textoPergunta(resultado.pergunta)
  const filtros = descreverFiltros(resultado.pergunta)
  const descricaoFiltros: [string, string][] = [
    ['Cenários', nomesCenarios.length ? nomesCenarios.join(', ') : 'todos'],
    ['Rodada', filtros.rodada],
    ['Produtos', filtros.produtos],
    ['Operações', filtros.operacoes],
  ]

  const exportar = async (fn: (c: ConteudoExportacao) => unknown, rotulo: string) => {
    setExportando(true)
    try {
      await fn({ resultado, nomesCenarios, visual: temGrafico ? (janela ? visualJanela.current : visual.current) : null })
      avisar(rotulo === 'Copiar' ? 'Resultado copiado para a área de transferência.' : `Arquivo ${rotulo} gerado.`)
    } catch (e) {
      avisar(`Não foi possível exportar: ${e instanceof Error ? e.message : e}`, 'erro')
    } finally {
      setExportando(false)
    }
  }

  const corpo = (emJanela: boolean) => (
    <div className="space-y-4">
      <div className="space-y-2 text-[0.95rem] leading-relaxed text-texto-forte">
        {resultado.resposta.split(/\n+/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {resultado.destaques.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-texto">
            {resultado.destaques.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
      </div>
      {temGrafico && (
        <div ref={emJanela ? visualJanela : visual} className="rounded-lg bg-white p-1">
          <Visualizacao formato={formato} especificacao={resultado.visualizacao} colunas={resultado.colunas} linhas={resultado.linhas} altura={emJanela ? 460 : 300} />
        </div>
      )}
      {resultado.colunas.length > 0 &&
        (formato === 'texto' ? (
          <details className="group">
            <summary className="cursor-pointer text-sm text-texto-verde hover:underline">Ver dados ({resultado.linhas.length.toLocaleString('pt-BR')} linhas)</summary>
            <div className="mt-2">
              <TabelaDados colunas={resultado.colunas} linhas={resultado.linhas} alturaMaxima={emJanela ? '60vh' : '20rem'} />
            </div>
          </details>
        ) : (
          <TabelaDados colunas={resultado.colunas} linhas={resultado.linhas} alturaMaxima={emJanela ? '50vh' : formato === 'tabela' ? '24rem' : '16rem'} />
        ))}
      {verSql && resultado.sql && (
        <pre className="overflow-x-auto rounded-lg bg-[#F3F3F3] p-3 text-xs leading-relaxed text-texto-forte">
          <code>{resultado.sql}</code>
        </pre>
      )}
    </div>
  )

  const barra = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`formato-${resultado.id ?? resultado.criado_em}`}>
        Formato do resultado
      </label>
      <select
        id={`formato-${resultado.id ?? resultado.criado_em}`}
        className="campo h-9 w-auto py-0 pr-8"
        value={formato}
        onChange={(e) => setFormato(e.target.value as Formato)}
      >
        {FORMATOS.map((f) => (
          <option key={f.valor} value={f.valor}>
            {f.rotulo}
          </option>
        ))}
      </select>
      {resultado.sql && (
        <button className={`botao-icone ${verSql ? 'bg-black/5 text-texto-forte' : ''}`} onClick={() => setVerSql((v) => !v)} title={verSql ? 'Ocultar SQL' : 'Ver SQL'} aria-pressed={verSql}>
          <Code2 size={18} />
        </button>
      )}
      {!janela && (
        <button className="botao-icone" onClick={() => setJanela(true)} title="Abrir em janela" aria-label="Abrir em janela">
          <Maximize2 size={17} />
        </button>
      )}
      <MenuOpcoes
        gatilho={(abrir) => (
          <button className="botao-icone" onClick={abrir} disabled={exportando} title="Exportar" aria-label="Exportar">
            <Download size={18} />
          </button>
        )}
        itens={[
          { rotulo: 'PDF', icone: <FileText size={16} />, aoClicar: () => void exportar(exportarPdf, 'PDF') },
          { rotulo: 'Excel (.xlsx)', icone: <FileSpreadsheet size={16} />, aoClicar: () => void exportar(exportarXlsx, 'Excel'), desativado: !resultado.colunas.length },
          { rotulo: 'Word (.docx)', icone: <FileType2 size={16} />, aoClicar: () => void exportar(exportarDocx, 'Word') },
          { rotulo: 'Bloco de notas (.txt)', icone: <FileText size={16} />, aoClicar: () => void exportar(exportarTxt, 'TXT') },
          { rotulo: 'CSV', icone: <Sheet size={16} />, aoClicar: () => void exportar(exportarCsv, 'CSV'), desativado: !resultado.colunas.length },
          { rotulo: 'Imagem PNG', icone: <Image size={16} />, aoClicar: () => void exportar(exportarPng, 'PNG'), desativado: !temGrafico, dica: 'Escolha um formato de gráfico ou dashboard' },
          { rotulo: 'Copiar', icone: <Copy size={16} />, aoClicar: () => void exportar(copiar, 'Copiar') },
        ]}
      />
      {aoReexecutar && (
        <button className="botao-secundario h-9" onClick={aoReexecutar} disabled={reexecutando}>
          <RotateCw size={15} className={reexecutando ? 'animate-spin' : ''} />
          Executar novamente
        </button>
      )}
    </div>
  )

  return (
    <article className="rounded-xl border border-divisor bg-white p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-medium text-texto-forte">{titulo}</h3>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-texto-secundario">
            <span>
              {salvo ? 'Salvo em ' : 'Em '}
              {formatarDataHora(resultado.criado_em)}
            </span>
            {descricaoFiltros.map(([rotulo, valor]) => (
              <span key={rotulo}>
                <span aria-hidden="true">· </span>
                <span className="font-medium text-texto">{rotulo}:</span> {valor}
              </span>
            ))}
          </p>
        </div>
        {barra}
      </header>
      {corpo(false)}

      <Dialogo aberto={janela} titulo={titulo} aoFechar={() => setJanela(false)} largura="tela">
        <div className="mb-4">{barra}</div>
        {corpo(true)}
      </Dialogo>
    </article>
  )
}
