/// <reference lib="webworker" />
// Lê o XML fora da thread principal para a interface não travar.
import { lerXml } from './parser'

/** Decodifica respeitando o encoding declarado no cabeçalho do XML (padrão UTF-8). */
function decodificar(buffer: ArrayBuffer): string {
  const inicio = new TextDecoder('ascii').decode(buffer.slice(0, 200))
  const encoding = inicio.match(/encoding=["']([\w-]+)["']/i)?.[1] ?? 'utf-8'
  try {
    return new TextDecoder(encoding).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

self.onmessage = async (evento: MessageEvent<{ arquivo: File }>) => {
  try {
    const conteudo = decodificar(await evento.data.arquivo.arrayBuffer())
    const resultado = lerXml(conteudo, (percentual, etapa) => self.postMessage({ tipo: 'progresso', percentual, etapa }))
    self.postMessage({ tipo: 'ok', resultado })
  } catch (e) {
    self.postMessage({ tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) })
  }
}
