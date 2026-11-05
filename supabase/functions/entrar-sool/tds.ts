// Cliente TDS mínimo para Azure SQL / SQL Server usando TDS 8.0 ("strict": TLS direto sobre o TCP).
// Faz apenas login com usuário e senha do SQL e consultas cujas colunas são NVARCHAR ou inteiros.
// Existe porque as bibliotecas Node (tedious/mssql) não conseguem negociar TLS no ambiente das Edge Functions.

export interface ConfigSql {
  servidor: string
  porta: number
  banco: string
  usuario: string
  senha: string
}

/** Converte uma string de conexão ADO.NET ("Server=tcp:host,1433; Initial Catalog=...; User ID=...; Password=...") */
export function lerStringConexao(texto: string): ConfigSql {
  const p: Record<string, string> = {}
  for (const item of texto.split(';')) {
    const i = item.indexOf('=')
    if (i < 0) continue
    p[item.slice(0, i).trim().toLowerCase().replace(/\s+/g, '')] = item.slice(i + 1).trim()
  }
  let servidor = (p['server'] ?? p['datasource'] ?? p['address'] ?? '').replace(/^tcp:/i, '')
  let porta = 1433
  const m = servidor.match(/^(.*?),(\d+)$/)
  if (m) {
    servidor = m[1]
    porta = Number(m[2])
  }
  return {
    servidor,
    porta,
    banco: p['initialcatalog'] ?? p['database'] ?? '',
    usuario: p['userid'] ?? p['uid'] ?? p['user'] ?? '',
    senha: p['password'] ?? p['pwd'] ?? '',
  }
}

/** Escapa um texto para um literal N'...' do T-SQL. */
export function literal(texto: string): string {
  if (texto.includes('\u0000')) throw new Error('Texto inválido.')
  return `N'${texto.replace(/'/g, "''")}'`
}

function ucs2(s: string): Uint8Array {
  const b = new Uint8Array(s.length * 2)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    b[i * 2] = c & 0xff
    b[i * 2 + 1] = c >> 8
  }
  return b
}

function deUcs2(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b[i] | (b[i + 1] << 8))
  return s
}

function juntar(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of partes) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const TIPO_SQL_BATCH = 0x01
const TIPO_LOGIN7 = 0x10
const TIPO_PRELOGIN = 0x12

type Coluna = { tipo: number; tamanho: number }
type Valor = string | number | null

interface Resposta {
  loginOk: boolean
  erros: string[]
  linhas: Valor[][]
  redirecionado: boolean
}

function lerTokens(d: Uint8Array): Resposta {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const r: Resposta = { loginOk: false, erros: [], linhas: [], redirecionado: false }
  let colunas: Coluna[] = []
  let i = 0
  while (i < d.length) {
    const t = d[i++]
    switch (t) {
      case 0xad: // LOGINACK
      case 0xe3: // ENVCHANGE
      case 0xab: // INFO
      case 0xaa: // ERROR
      case 0xa9: // ORDER
      case 0xa4: // TABNAME
      case 0xa5: {
        // COLINFO
        const len = dv.getUint16(i, true)
        const ini = i + 2
        if (t === 0xad) r.loginOk = true
        if (t === 0xaa) {
          const numero = dv.getUint32(ini, true)
          const chars = dv.getUint16(ini + 6, true)
          r.erros.push(`${deUcs2(d.subarray(ini + 8, ini + 8 + chars * 2))} (erro ${numero})`)
        }
        if (t === 0xe3 && d[ini] === 20) r.redirecionado = true
        i = ini + len
        break
      }
      case 0xfd: // DONE
      case 0xfe: // DONEPROC
      case 0xff: // DONEINPROC
        i += 12
        break
      case 0x79: // RETURNSTATUS
        i += 4
        break
      case 0xae: {
        // FEATUREEXTACK
        while (d[i] !== 0xff) {
          i += 1
          const l = dv.getUint32(i, true)
          i += 4 + l
        }
        i += 1
        break
      }
      case 0x81: {
        // COLMETADATA
        const n = dv.getUint16(i, true)
        i += 2
        colunas = []
        if (n === 0xffff) break
        for (let k = 0; k < n; k++) {
          i += 4 + 2 // UserType + Flags
          const tipo = d[i++]
          let tamanho = 0
          if (tipo === 0xe7 || tipo === 0xef || tipo === 0xa7 || tipo === 0xaf) {
            tamanho = dv.getUint16(i, true)
            i += 2 + 5 // tamanho + collation
            if (tamanho === 0xffff) throw new Error('Coluna (MAX) não suportada pelo cliente TDS mínimo.')
          } else if (tipo === 0x26) {
            tamanho = d[i++]
          } else if (tipo === 0x30) tamanho = 1
          else if (tipo === 0x34) tamanho = 2
          else if (tipo === 0x38) tamanho = 4
          else if (tipo === 0x7f) tamanho = 8
          else throw new Error(`Tipo de coluna TDS não suportado: 0x${tipo.toString(16)}`)
          colunas.push({ tipo, tamanho })
          const nomeLen = d[i++]
          i += nomeLen * 2
        }
        break
      }
      case 0xd1: {
        // ROW
        const linha: Valor[] = []
        for (const c of colunas) {
          if (c.tipo === 0xe7 || c.tipo === 0xef || c.tipo === 0xa7 || c.tipo === 0xaf) {
            const l = dv.getUint16(i, true)
            i += 2
            if (l === 0xffff) linha.push(null)
            else {
              const bytes = d.subarray(i, i + l)
              linha.push(c.tipo === 0xe7 || c.tipo === 0xef ? deUcs2(bytes) : new TextDecoder('latin1').decode(bytes))
              i += l
            }
          } else {
            let l = c.tamanho
            if (c.tipo === 0x26) l = d[i++]
            if (l === 0) linha.push(null)
            else {
              let v = 0
              if (l === 1) v = d[i]
              else if (l === 2) v = dv.getInt16(i, true)
              else if (l === 4) v = dv.getInt32(i, true)
              else v = Number(dv.getBigInt64(i, true))
              linha.push(v)
              i += l
            }
          }
        }
        r.linhas.push(linha)
        break
      }
      default:
        throw new Error(`Token TDS não suportado: 0x${t.toString(16)}`)
    }
  }
  return r
}

export class ConexaoSql {
  private buffer = new Uint8Array(0)
  private idPacote = 1

  private constructor(private conn: Deno.TlsConn) {}

  static async abrir(cfg: ConfigSql, tempoMs = 20000): Promise<ConexaoSql> {
    const conn = await comTempo(Deno.connectTls({ hostname: cfg.servidor, port: cfg.porta, alpnProtocols: ['tds/8.0'] }), tempoMs, 'conexão')
    await comTempo(conn.handshake(), tempoMs, 'TLS')
    const c = new ConexaoSql(conn)
    try {
      await c.prelogin()
      await c.login(cfg)
    } catch (e) {
      c.fechar()
      throw e
    }
    return c
  }

  fechar() {
    try {
      this.conn.close()
    } catch {
      /* já fechada */
    }
  }

  private async escrever(dados: Uint8Array) {
    let o = 0
    while (o < dados.length) o += await this.conn.write(dados.subarray(o))
  }

  private async enviar(tipo: number, dados: Uint8Array) {
    const max = 4096 - 8
    let o = 0
    do {
      const parte = dados.subarray(o, o + max)
      o += parte.length
      const p = new Uint8Array(8 + parte.length)
      p[0] = tipo
      p[1] = o >= dados.length ? 0x01 : 0x00
      p[2] = (p.length >> 8) & 0xff
      p[3] = p.length & 0xff
      p[6] = this.idPacote++ & 0xff
      p.set(parte, 8)
      await this.escrever(p)
    } while (o < dados.length)
  }

  private async lerBytes(n: number): Promise<Uint8Array> {
    while (this.buffer.length < n) {
      const tmp = new Uint8Array(16384)
      const lidos = await this.conn.read(tmp)
      if (lidos === null) throw new Error('O SQL Server encerrou a conexão.')
      this.buffer = juntar([this.buffer, tmp.subarray(0, lidos)])
    }
    const out = this.buffer.slice(0, n)
    this.buffer = this.buffer.slice(n)
    return out
  }

  private async receber(tempoMs = 20000): Promise<Uint8Array> {
    return await comTempo(
      (async () => {
        const partes: Uint8Array[] = []
        for (;;) {
          const cab = await this.lerBytes(8)
          const len = (cab[2] << 8) | cab[3]
          partes.push(await this.lerBytes(len - 8))
          if (cab[1] & 0x01) break
        }
        return juntar(partes)
      })(),
      tempoMs,
      'resposta',
    )
  }

  private async prelogin() {
    // VERSION (offset 11, 6 bytes) e ENCRYPTION (offset 17, 1 byte); terminador 0xFF.
    const dados = new Uint8Array([0x00, 0x00, 0x0b, 0x00, 0x06, 0x01, 0x00, 0x11, 0x00, 0x01, 0xff, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01])
    await this.enviar(TIPO_PRELOGIN, dados)
    await this.receber()
  }

  private async login(cfg: ConfigSql) {
    const campos: Uint8Array[] = []
    const textos = ['sool2ai', cfg.usuario, cfg.senha, 'SOOL2.ai', cfg.servidor, '', 'sool2ai', '', cfg.banco]
    const fixo = new Uint8Array(94)
    const dv = new DataView(fixo.buffer)
    dv.setUint32(4, 0x74000004, true) // TDS 7.4
    dv.setUint32(8, 4096, true) // tamanho do pacote
    dv.setUint32(12, 0x07000000, true)
    fixo[24] = 0xe0 // USE_DB_ON | INIT_DB_FATAL | SET_LANG_ON
    fixo[25] = 0x03 // INIT_LANG_FATAL | ODBC_ON
    dv.setUint32(32, 0x0409, true) // LCID
    let offset = 94
    let pos = 36
    textos.forEach((t, idx) => {
      let b = ucs2(t)
      if (idx === 2) b = b.map((x) => (((x << 4) & 0xf0) | (x >> 4)) ^ 0xa5) // senha ofuscada
      dv.setUint16(pos, offset, true)
      dv.setUint16(pos + 2, t.length, true)
      pos += 4
      campos.push(b)
      offset += b.length
    })
    // ClientID (6 bytes) já zerado em 72..77; SSPI, AtchDBFile, ChangePassword vazios no fim.
    dv.setUint16(78, offset, true)
    dv.setUint16(82, offset, true)
    dv.setUint16(86, offset, true)
    const pacote = juntar([fixo, ...campos])
    new DataView(pacote.buffer).setUint32(0, pacote.length, true)
    await this.enviar(TIPO_LOGIN7, pacote)
    const r = lerTokens(await this.receber())
    if (r.redirecionado) throw new Error('O Azure SQL pediu redirecionamento de conexão; configure a política de conexão do servidor como "Proxy".')
    if (!r.loginOk) throw new Error(r.erros.join(' ') || 'Falha no login do SQL Server.')
  }

  /** Executa um lote T-SQL e devolve as linhas do(s) resultado(s). */
  async consultar(sql: string): Promise<Valor[][]> {
    const cab = new Uint8Array(22)
    const dv = new DataView(cab.buffer)
    dv.setUint32(0, 22, true)
    dv.setUint32(4, 18, true)
    dv.setUint16(8, 2, true) // transaction descriptor
    dv.setUint32(18, 1, true) // outstanding requests
    await this.enviar(TIPO_SQL_BATCH, juntar([cab, ucs2(sql)]))
    const r = lerTokens(await this.receber())
    if (r.erros.length) throw new Error(r.erros.join(' '))
    return r.linhas
  }
}

async function comTempo<T>(p: Promise<T>, ms: number, etapa: string): Promise<T> {
  let id = 0
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => (id = setTimeout(() => rej(new Error(`Tempo esgotado (${etapa}) ao falar com o SQL Server.`)), ms)))])
  } finally {
    clearTimeout(id)
  }
}
