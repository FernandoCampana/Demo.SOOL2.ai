import { formatarNumero, slug } from './formatacao'

/** Exportação das visões da página Dashboards em PDF, Word, Excel, CSV e PNG. */

export type TipoColuna = 'texto' | 'numero' | 'moeda' | 'percentual'
export type FormatoExportacao = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'png'

export interface ColunaVisao {
  nome: string
  tipo: TipoColuna
}

export interface VisaoExportacao {
  id: string
  titulo: string
  subtitulo?: string
  colunas: ColunaVisao[]
  linhas: (string | number | null)[][]
  /** Elemento com o gráfico, para gerar a imagem (PDF, Word e PNG). */
  elemento?: HTMLElement | null
}

export interface PacoteExportacao {
  filtros: [string, string][]
  visoes: VisaoExportacao[]
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
const percentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

function formatar(v: string | number | null, tipo: TipoColuna): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'string') return v
  if (tipo === 'moeda') return moeda.format(v)
  if (tipo === 'percentual') return percentual.format(v)
  if (tipo === 'numero') return formatarNumero(v)
  return String(v)
}

const nomeBase = () => `sool2ai-dashboards-${new Date().toISOString().slice(0, 10)}`

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

async function imagemPng(no: HTMLElement | null | undefined): Promise<{ url: string; largura: number; altura: number } | null> {
  if (!no) return null
  const { toPng } = await import('html-to-image')
  const url = await toPng(no, { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true, width: no.scrollWidth, height: no.scrollHeight })
  const img = new Image()
  await new Promise((ok, erro) => {
    img.onload = ok
    img.onerror = erro
    img.src = url
  })
  return { url, largura: img.width, altura: img.height }
}

/* ------------------------------------------------------------------ Excel */

async function exportarXlsx(p: PacoteExportacao) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const usados = new Set<string>()
  const nomeAba = (titulo: string) => {
    const base = titulo.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Visão'
    let nome = base
    for (let i = 2; usados.has(nome.toLowerCase()); i++) nome = `${base.slice(0, 26)} ${i}`
    usados.add(nome.toLowerCase())
    return nome
  }
  const FORMATOS: Record<TipoColuna, string | undefined> = { texto: undefined, numero: '#,##0.00', moeda: '"R$" #,##0.00', percentual: '0.0%' }

  for (const v of p.visoes) {
    const folha = XLSX.utils.aoa_to_sheet([v.colunas.map((c) => c.nome), ...v.linhas])
    folha['!cols'] = v.colunas.map((c, i) => ({ wch: Math.min(48, Math.max(12, c.nome.length + 2, ...v.linhas.slice(0, 200).map((l) => String(l[i] ?? '').length + 2))) }))
    v.colunas.forEach((c, j) => {
      const z = FORMATOS[c.tipo]
      if (!z) return
      for (let i = 0; i < v.linhas.length; i++) {
        const celula = folha[XLSX.utils.encode_cell({ r: i + 1, c: j })]
        if (celula && celula.t === 'n') celula.z = z
      }
    })
    XLSX.utils.book_append_sheet(wb, folha, nomeAba(v.titulo))
  }
  const filtros = XLSX.utils.aoa_to_sheet([['Gerado em', new Date().toLocaleString('pt-BR')], ...p.filtros])
  filtros['!cols'] = [{ wch: 30 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(wb, filtros, nomeAba('Filtros'))
  XLSX.writeFile(wb, `${nomeBase()}.xlsx`)
}

/* -------------------------------------------------------------------- CSV */

function valorCsv(v: string | number | null): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return String(v).replace('.', ',')
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** Um arquivo CSV por visão, no padrão do Excel em português (";" e vírgula decimal). */
async function exportarCsv(p: PacoteExportacao) {
  for (const v of p.visoes) {
    const texto = [v.colunas.map((c) => valorCsv(c.nome)).join(';'), ...v.linhas.map((l) => l.map(valorCsv).join(';'))].join('\r\n')
    baixar(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }), `${nomeBase()}-${slug(v.titulo, 40)}.csv`)
    await esperar(350)
  }
}

/* -------------------------------------------------------------------- PNG */

async function exportarPng(p: PacoteExportacao) {
  const comImagem = p.visoes.filter((v) => v.elemento)
  if (!comImagem.length) throw new Error('As visões escolhidas não têm gráfico. Escolha PDF, Word, Excel ou CSV para exportar tabelas.')
  for (const v of comImagem) {
    const img = await imagemPng(v.elemento)
    if (!img) continue
    baixar(await (await fetch(img.url)).blob(), `${nomeBase()}-${slug(v.titulo, 40)}.png`)
    await esperar(350)
  }
}

/* -------------------------------------------------------------------- PDF */

async function exportarPdf(p: PacoteExportacao) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const alturaPagina = doc.internal.pageSize.getHeight()
  const margem = 14
  const util = largura - margem * 2
  let y = margem

  const escrever = (texto: string, tamanho: number, cor: [number, number, number], negrito = false, espaco = 2) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal')
    doc.setFontSize(tamanho)
    doc.setTextColor(...cor)
    for (const linha of doc.splitTextToSize(texto, util) as string[]) {
      if (y > alturaPagina - margem) {
        doc.addPage()
        y = margem
      }
      doc.text(linha, margem, y)
      y += tamanho * 0.42
    }
    y += espaco
  }
  const faixa = () => {
    doc.setFillColor(56, 142, 60)
    doc.rect(0, 0, largura, 6, 'F')
  }

  faixa()
  y = 16
  escrever('Demo.SOOL2.ai', 9, [46, 125, 50], true, 1)
  escrever('Dashboards dinâmicos', 16, [74, 74, 74], true, 2)
  escrever(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 8.5, [117, 117, 117], false, 1)
  for (const [k, v] of p.filtros) escrever(`${k}: ${v}`, 8.5, [117, 117, 117], false, 0.5)
  y += 4

  for (const [i, v] of p.visoes.entries()) {
    if (i > 0) {
      doc.addPage()
      faixa()
      y = 16
    }
    escrever(v.titulo, 13, [74, 74, 74], true, 1)
    if (v.subtitulo) escrever(v.subtitulo, 8.5, [117, 117, 117], false, 3)

    const img = await imagemPng(v.elemento).catch(() => null)
    if (img) {
      const proporcao = img.altura / img.largura
      let w = util
      let h = w * proporcao
      const maxH = alturaPagina - y - margem
      if (h > maxH) {
        h = maxH
        w = h / proporcao
      }
      doc.addImage(img.url, 'PNG', margem, y, w, h, undefined, 'FAST')
      y += h + 4
    }

    if (v.colunas.length && v.linhas.length) {
      if (y > alturaPagina - margem - 20) {
        doc.addPage()
        faixa()
        y = 16
      }
      autoTable(doc, {
        startY: y,
        margin: { left: margem, right: margem, top: 12 },
        head: [v.colunas.map((c) => c.nome)],
        body: v.linhas.slice(0, 3000).map((l) => l.map((x, j) => formatar(x, v.colunas[j]?.tipo ?? 'texto'))),
        columnStyles: Object.fromEntries(v.colunas.map((c, j) => [j, { halign: (c.tipo === 'texto' ? 'left' : 'right') as 'left' | 'right' }])),
        styles: { fontSize: 7.5, cellPadding: 1.5, textColor: [74, 74, 74], lineColor: [227, 227, 227], lineWidth: 0.1 },
        headStyles: { fillColor: [232, 245, 233], textColor: [46, 125, 50], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 250] },
      })
    }
  }

  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(117, 117, 117)
    doc.text(`Página ${i} de ${paginas}`, largura - margem, alturaPagina - 6, { align: 'right' })
  }
  doc.save(`${nomeBase()}.pdf`)
}

/* ------------------------------------------------------------------- Word */

async function exportarDocx(p: PacoteExportacao) {
  const d = await import('docx')
  const LARGURA_UTIL = 14570 // A4 paisagem com margens de 2 cm, em DXA
  const filhos: (InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>)[] = [
    new d.Paragraph({ children: [new d.TextRun({ text: 'Demo.SOOL2.ai', bold: true, color: '2E7D32', size: 18 })] }),
    new d.Paragraph({ heading: d.HeadingLevel.HEADING_1, children: [new d.TextRun({ text: 'Dashboards dinâmicos', color: '4A4A4A' })] }),
    new d.Paragraph({ children: [new d.TextRun({ text: `Gerado em ${new Date().toLocaleString('pt-BR')}`, color: '757575', size: 18 })] }),
    ...p.filtros.map(([k, v]) => new d.Paragraph({ children: [new d.TextRun({ text: `${k}: `, bold: true, color: '757575', size: 18 }), new d.TextRun({ text: v, color: '757575', size: 18 })] })),
  ]

  for (const [i, v] of p.visoes.entries()) {
    filhos.push(new d.Paragraph({ heading: d.HeadingLevel.HEADING_2, pageBreakBefore: i > 0, spacing: { before: 240 }, children: [new d.TextRun({ text: v.titulo, color: '4A4A4A' })] }))
    if (v.subtitulo) filhos.push(new d.Paragraph({ children: [new d.TextRun({ text: v.subtitulo, color: '757575', size: 18 })] }))
    const img = await imagemPng(v.elemento).catch(() => null)
    if (img) {
      const base64 = img.url.split(',')[1]
      const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
      let largura = 900
      let altura = Math.round((img.altura / img.largura) * largura)
      if (altura > 520) {
        largura = Math.round((520 / altura) * largura)
        altura = 520
      }
      filhos.push(new d.Paragraph({ spacing: { before: 160, after: 160 }, children: [new d.ImageRun({ data: bytes, transformation: { width: largura, height: altura } })] }))
    }
    if (v.colunas.length && v.linhas.length) {
      const limite = 500
      const larguraColuna = Math.floor(LARGURA_UTIL / v.colunas.length)
      const celula = (texto: string, cab: boolean, direita: boolean) =>
        new d.TableCell({
          width: { size: larguraColuna, type: d.WidthType.DXA },
          shading: cab ? { type: d.ShadingType.CLEAR, color: 'auto', fill: 'E8F5E9' } : undefined,
          children: [
            new d.Paragraph({
              alignment: direita ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT,
              children: [new d.TextRun({ text: texto, size: 16, bold: cab, color: cab ? '2E7D32' : '4A4A4A' })],
            }),
          ],
        })
      const tipoDe = (j: number) => v.colunas[j]?.tipo ?? 'texto'
      filhos.push(
        new d.Table({
          width: { size: LARGURA_UTIL, type: d.WidthType.DXA },
          columnWidths: v.colunas.map(() => larguraColuna),
          rows: [
            new d.TableRow({ tableHeader: true, children: v.colunas.map((c) => celula(c.nome, true, c.tipo !== 'texto')) }),
            ...v.linhas.slice(0, limite).map((l) => new d.TableRow({ children: l.map((x, j) => celula(formatar(x, tipoDe(j)), false, tipoDe(j) !== 'texto')) })),
          ],
        }),
      )
      if (v.linhas.length > limite) {
        filhos.push(new d.Paragraph({ children: [new d.TextRun({ text: `Mostrando ${limite} de ${v.linhas.length} linhas. Exporte para Excel para ver todas.`, italics: true, size: 18, color: '757575' })] }))
      }
    }
  }

  const documento = new d.Document({
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [
      {
        properties: { page: { size: { orientation: d.PageOrientation.LANDSCAPE }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: filhos,
      },
    ],
  })
  baixar(await d.Packer.toBlob(documento), `${nomeBase()}.docx`)
}

export async function exportarDashboard(p: PacoteExportacao, formato: FormatoExportacao) {
  if (!p.visoes.length) throw new Error('Escolha pelo menos uma visão para exportar.')
  if (formato === 'xlsx') return exportarXlsx(p)
  if (formato === 'csv') return exportarCsv(p)
  // As imagens saem sempre com as cores do fundo branco, mesmo com o tema escuro ligado.
  const raiz = document.documentElement
  const escuro = raiz.classList.contains('dark')
  if (escuro) {
    raiz.classList.remove('dark')
    await esperar(150)
  }
  try {
    if (formato === 'png') return await exportarPng(p)
    if (formato === 'pdf') return await exportarPdf(p)
    return await exportarDocx(p)
  } finally {
    if (escuro) raiz.classList.add('dark')
  }
}
