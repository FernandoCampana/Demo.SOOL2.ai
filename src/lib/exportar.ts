import { formatarDataHora, formatarValor, paraNumero, rotuloColuna, slug } from './formatacao'
import type { Resultado } from './tipos'

export interface ConteudoExportacao {
  resultado: Resultado
  nomesCenarios: string[]
  /** Elemento com o gráfico ou dashboard, para gerar a imagem. */
  visual?: HTMLElement | null
}

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

function nomeBase(r: Resultado): string {
  return `sool2ai-${slug(r.pergunta)}-${new Date().toISOString().slice(0, 10)}`
}

function cabecalho(c: ConteudoExportacao): string[] {
  const r = c.resultado
  return [
    `Data: ${formatarDataHora(r.criado_em)}`,
    `Cenários: ${c.nomesCenarios.length ? c.nomesCenarios.join(', ') : 'todos os cenários disponíveis'}`,
  ]
}

async function imagemPng(no: HTMLElement | null | undefined): Promise<{ url: string; largura: number; altura: number } | null> {
  if (!no) return null
  const { toPng } = await import('html-to-image')
  const url = await toPng(no, { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true })
  const img = new Image()
  await new Promise((ok, erro) => {
    img.onload = ok
    img.onerror = erro
    img.src = url
  })
  return { url, largura: img.width, altura: img.height }
}

function valorCsv(v: unknown): string {
  const n = paraNumero(v)
  if (n !== null) return String(n).replace('.', ',')
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV no padrão do Excel em português: separador ";" e vírgula decimal. */
export function exportarCsv(c: ConteudoExportacao) {
  const { colunas, linhas } = c.resultado
  const texto = [colunas.map((x) => valorCsv(rotuloColuna(x))).join(';'), ...linhas.map((l) => colunas.map((x) => valorCsv(l[x])).join(';'))].join('\r\n')
  baixar(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }), `${nomeBase(c.resultado)}.csv`)
}

function tabelaTexto(colunas: string[], linhas: Record<string, unknown>[], separador: 'alinhado' | 'tab'): string {
  const cab = colunas.map(rotuloColuna)
  const corpo = linhas.map((l) => colunas.map((x) => formatarValor(l[x])))
  if (separador === 'tab') return [cab, ...corpo].map((r) => r.join('\t')).join('\n')
  const larguras = cab.map((h, i) => Math.min(40, Math.max(h.length, ...corpo.map((r) => r[i].length))))
  const linha = (r: string[]) => r.map((v, i) => v.slice(0, 40).padEnd(larguras[i])).join('  ')
  return [linha(cab), larguras.map((w) => '-'.repeat(w)).join('  '), ...corpo.map(linha)].join('\n')
}

export function textoResultado(c: ConteudoExportacao, separador: 'alinhado' | 'tab' = 'alinhado'): string {
  const r = c.resultado
  const partes = [r.pergunta, '', ...cabecalho(c), '', r.resposta]
  if (r.destaques.length) partes.push('', 'Destaques:', ...r.destaques.map((d) => `- ${d}`))
  if (r.colunas.length) partes.push('', tabelaTexto(r.colunas, r.linhas, separador))
  if (r.sql) partes.push('', 'Consulta SQL:', r.sql)
  return partes.join('\n')
}

export function exportarTxt(c: ConteudoExportacao) {
  baixar(new Blob([textoResultado(c)], { type: 'text/plain;charset=utf-8' }), `${nomeBase(c.resultado)}.txt`)
}

export async function copiar(c: ConteudoExportacao) {
  await navigator.clipboard.writeText(textoResultado(c, 'tab'))
}

export async function exportarXlsx(c: ConteudoExportacao) {
  const XLSX = await import('xlsx')
  const r = c.resultado
  const wb = XLSX.utils.book_new()
  const dados = r.linhas.map((l) => Object.fromEntries(r.colunas.map((x) => [rotuloColuna(x), paraNumero(l[x]) ?? l[x] ?? null])))
  const planilha = XLSX.utils.json_to_sheet(dados, { header: r.colunas.map(rotuloColuna) })
  planilha['!cols'] = r.colunas.map((x) => ({ wch: Math.min(40, Math.max(12, rotuloColuna(x).length + 2)) }))
  XLSX.utils.book_append_sheet(wb, planilha, 'Dados')
  const resumo = [
    ['Pergunta', r.pergunta],
    ...cabecalho(c).map((t) => t.split(': ')),
    ['Resposta', r.resposta],
    ...r.destaques.map((d, i) => [`Destaque ${i + 1}`, d]),
    ['Consulta SQL', r.sql ?? ''],
  ]
  const folhaResumo = XLSX.utils.aoa_to_sheet(resumo)
  folhaResumo['!cols'] = [{ wch: 16 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(wb, folhaResumo, 'Resumo')
  XLSX.writeFile(wb, `${nomeBase(r)}.xlsx`)
}

export async function exportarPng(c: ConteudoExportacao) {
  const img = await imagemPng(c.visual)
  if (!img) throw new Error('Não há gráfico para exportar como imagem.')
  const blob = await (await fetch(img.url)).blob()
  baixar(blob, `${nomeBase(c.resultado)}.png`)
}

export async function exportarPdf(c: ConteudoExportacao) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const r = c.resultado
  const paisagem = r.colunas.length > 6
  const doc = new jsPDF({ orientation: paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
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

  doc.setFillColor(56, 142, 60)
  doc.rect(0, 0, largura, 8, 'F')
  y = 16
  escrever('Demo.SOOL2.ai', 9, [46, 125, 50], true, 1)
  escrever(r.pergunta, 14, [74, 74, 74], true, 2)
  escrever(cabecalho(c).join('   |   '), 8.5, [117, 117, 117], false, 4)
  escrever(r.resposta, 10.5, [74, 74, 74], false, 3)
  for (const d of r.destaques) escrever(`•  ${d}`, 10, [74, 74, 74], false, 1)
  y += 2

  const img = await imagemPng(c.visual).catch(() => null)
  if (img) {
    const w = util
    const h = Math.min((img.altura / img.largura) * w, alturaPagina - margem * 2)
    if (y + h > alturaPagina - margem) {
      doc.addPage()
      y = margem
    }
    doc.addImage(img.url, 'PNG', margem, y, w * (h / ((img.altura / img.largura) * w)), h, undefined, 'FAST')
    y += h + 4
  }

  if (r.colunas.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: margem, right: margem },
      head: [r.colunas.map(rotuloColuna)],
      body: r.linhas.slice(0, 2000).map((l) => r.colunas.map((x) => formatarValor(l[x]))),
      styles: { fontSize: 7.5, cellPadding: 1.5, textColor: [74, 74, 74], lineColor: [227, 227, 227], lineWidth: 0.1 },
      headStyles: { fillColor: [232, 245, 233], textColor: [46, 125, 50], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    })
  }

  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(117, 117, 117)
    doc.text(`Página ${i} de ${paginas}`, largura - margem, alturaPagina - 6, { align: 'right' })
  }
  doc.save(`${nomeBase(r)}.pdf`)
}

export async function exportarDocx(c: ConteudoExportacao) {
  const d = await import('docx')
  const r = c.resultado
  const LARGURA_UTIL = 9638 // A4 com margens de 2 cm, em DXA
  const filhos: (InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>)[] = [
    new d.Paragraph({ children: [new d.TextRun({ text: 'Demo.SOOL2.ai', bold: true, color: '2E7D32', size: 18 })] }),
    new d.Paragraph({ heading: d.HeadingLevel.HEADING_1, children: [new d.TextRun({ text: r.pergunta, color: '4A4A4A' })] }),
    ...cabecalho(c).map((t) => new d.Paragraph({ children: [new d.TextRun({ text: t, color: '757575', size: 18 })] })),
    new d.Paragraph({ text: '' }),
    ...r.resposta.split(/\n+/).map((p) => new d.Paragraph({ spacing: { after: 120 }, children: [new d.TextRun({ text: p, size: 22 })] })),
    ...r.destaques.map((t) => new d.Paragraph({ bullet: { level: 0 }, children: [new d.TextRun({ text: t, size: 22 })] })),
  ]

  const img = await imagemPng(c.visual).catch(() => null)
  if (img) {
    const base64 = img.url.split(',')[1]
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
    const largura = 600
    filhos.push(
      new d.Paragraph({
        spacing: { before: 200, after: 200 },
        children: [new d.ImageRun({ data: bytes, transformation: { width: largura, height: Math.round((img.altura / img.largura) * largura) } })],
      }),
    )
  }

  if (r.colunas.length) {
    const limite = 300
    const larguraColuna = Math.floor(LARGURA_UTIL / r.colunas.length)
    const celula = (texto: string, cabecalhoTabela = false) =>
      new d.TableCell({
        width: { size: larguraColuna, type: d.WidthType.DXA },
        shading: cabecalhoTabela ? { type: d.ShadingType.CLEAR, color: 'auto', fill: 'E8F5E9' } : undefined,
        children: [new d.Paragraph({ children: [new d.TextRun({ text: texto, size: 16, bold: cabecalhoTabela, color: cabecalhoTabela ? '2E7D32' : '4A4A4A' })] })],
      })
    filhos.push(
      new d.Table({
        width: { size: LARGURA_UTIL, type: d.WidthType.DXA },
        columnWidths: r.colunas.map(() => larguraColuna),
        rows: [
          new d.TableRow({ tableHeader: true, children: r.colunas.map((x) => celula(rotuloColuna(x), true)) }),
          ...r.linhas.slice(0, limite).map((l) => new d.TableRow({ children: r.colunas.map((x) => celula(formatarValor(l[x]))) })),
        ],
      }),
    )
    if (r.linhas.length > limite) {
      filhos.push(new d.Paragraph({ children: [new d.TextRun({ text: `Mostrando ${limite} de ${r.linhas.length} linhas. Exporte para Excel para ver todas.`, italics: true, size: 18, color: '757575' })] }))
    }
  }

  const documento = new d.Document({
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: filhos }],
  })
  baixar(await d.Packer.toBlob(documento), `${nomeBase(r)}.docx`)
}
