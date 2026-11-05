# Etanol Anidro: prompt de gráficos e perguntas de negócio

Fonte: `ccc.xlsx`, aba **ETANOL ANIDRO** (a aba "Planilha1" está vazia).

## 1. O que a planilha contém

É uma **matriz de alocação fornecedor × base** de etanol anidro para o período **2026-07**, com 87 linhas de contrato e 59 bases de destino.

| Bloco | Onde está | Conteúdo |
|---|---|---|
| Cabeçalho de bases | Linha 2, colunas I:BQ | 59 códigos de base (AICAMP, AICAR … BETER, LOGUM RP, LOGUM UBB) + coluna "Total" |
| Demanda por base | Linhas 3 e 4, colunas I:BQ | Volume requerido por base (total 236.185) |
| Contratos | Linhas 5 em diante, colunas A:H | Fornecedor/usina, Período, Mínimo, Flat, Máximo, Tipo (CIF/FOB), Situação, Código |
| Alocação | Mesmas linhas, colunas I:BQ | Volume de cada contrato enviado a cada base |
| Fechamento por contrato | Colunas BR e BS | Total alocado e "Oferta Não Distribuída" |
| Rodapé por base | Últimas linhas | Recebido, Enviado (vazia), Demanda Atendida, Custo Total, Custo Unitário |

Números-chave já calculados a partir dos dados:

- Demanda total: **236.185**. Oferta contratada: **228.654** (CIF 127.650; FOB 101.004). Volume alocado: **223.679**.
- Demanda não atendida: **12.506**, concentrada em AISUAP (−1.675), ARCAB (−1.100), ARFIG (−1.000, zerada), ARJOI (−1.500, zerada), BAFOR (−2.125), BAGAM (−3.450), BAMAN (−575) e outras menores.
- Oferta não distribuída: **4.975** (EVOLUA cód. 24/25, INPASA cód. 39/40, BARRALCOOL e PEDRO AFONSO, esta com 1.200 sem destino).
- Custo total: **R$ 650,9 mi**. Custo médio ponderado ≈ **R$ 2.910/un**. Custo unitário por base varia de **2.660 (BACAD)** a **3.491 (BACRO)**.
- Mínimo = Flat = Máximo em todos os contratos, ou seja, não há flexibilidade de volume modelada.
- Atenção: unidades não estão rotuladas. Assumi volume em m³ e custo em R$/m³; confirme antes de publicar.

## 2. Prompt pronto para gerar os gráficos

Copie o bloco abaixo e use em qualquer IA com execução de código (Claude, ChatGPT com Code Interpreter etc.), anexando o `ccc.xlsx` (neste repositório, em `dados/ccc.xlsx`).

```text
Você é um analista sênior de pesquisa operacional em supply chain de distribuidoras de combustíveis.
Anexei a planilha ccc.xlsx. Use apenas a aba "ETANOL ANIDRO". Gere os gráficos em Python
(pandas + matplotlib ou plotly), em português, com título, unidades nos eixos e rótulos de valor.

ESTRUTURA DA ABA (leia com header=None, sem confiar em nomes automáticos):
- Linha 2, colunas I até BQ: códigos das 59 bases de destino. A coluna "Total" (BR) é o total.
- Linha 4, colunas I até BQ: DEMANDA de cada base.
- Linhas 5 até a linha anterior a "Recebido" (coluna H): um contrato por linha.
  A=Fornecedor/usina, B=Período, C=Mínimo, D=Flat, E=Máximo, F=Tipo (CIF/FOB),
  G=Situação, H=Código do contrato.
  I:BQ = volume alocado do contrato para cada base (vazio = 0).
  BR = total alocado do contrato; BS = "Oferta Não Distribuída".
- Rodapé, identificado pelo texto na coluna H: "Recebido", "Enviado", "Demanda Atendida",
  "Custo Total" (R$ por base) e "Custo Unitário" (R$/m³ por base), valores em I:BQ.

PREPARAÇÃO:
1. Transforme a matriz em formato longo: fornecedor, codigo, tipo, base, volume (só volume > 0).
2. Normalize o nome do fornecedor para o GRUPO econômico (texto antes de " - " ou " | ",
   ex.: "EVOLUA - IACANGA | IACANGA-SP" -> "EVOLUA"; "FS" -> "FS"; "RAÍZEN GASA" -> "RAÍZEN").
   Mantenha também a usina/origem (cidade-UF após "|", quando houver).
3. Crie a tabela por base: demanda, recebido, gap = demanda - recebido, % atendimento,
   custo total, custo unitário, nº de fornecedores, participação CIF x FOB.
4. Assuma volume em m³ e custo em R$/m³ e escreva essa premissa no rodapé de cada gráfico.

GRÁFICOS:
1. KPIs no topo: demanda total, oferta contratada, volume alocado, demanda não atendida,
   oferta não distribuída, custo total e custo médio ponderado.
2. Barras agrupadas por base (ordenadas pela demanda): demanda x recebido, destacando em
   vermelho as bases com gap > 0.
3. Barras horizontais do gap por base (só gap > 0), com % de atendimento no rótulo.
4. Barras do custo unitário por base, ordenadas, com linha da média ponderada;
   cor por prefixo do código da base (AI, AR, BA, BE, LOGUM).
5. Dispersão: volume recebido (x) vs custo unitário (y) por base, tamanho = custo total,
   rótulo com o código das 10 bases mais caras.
6. Pareto dos grupos fornecedores por volume alocado (barras + % acumulado).
7. Barras empilhadas por grupo fornecedor: CIF vs FOB.
8. Diagrama de Sankey: grupo fornecedor -> base (volumes alocados).
9. Heatmap fornecedor (grupo) x base com o volume alocado, para ver concentração.
10. Barras da oferta não distribuída por contrato (fornecedor + código), só valores > 0.
11. Barras empilhadas por base: participação de cada fornecedor no abastecimento,
    sinalizando bases com fornecedor único (risco de dependência).
12. Mapa de dependência: nº de fornecedores por base vs volume da base.

ENTREGA:
- Cada gráfico com 2 a 3 frases de insight objetivo, citando números.
- Ao final, uma seção "Pontos de atenção" com: bases desabastecidas, oferta parada que poderia
  cobrir esses gaps, bases com custo unitário acima de 10% da média e bases com fornecedor único.
- Liste todas as premissas e qualquer inconsistência encontrada nos dados
  (ex.: linha "Enviado" vazia, unidades não rotuladas, Mínimo = Flat = Máximo).
```

## 3. Perguntas de negócio que os dados respondem

**Nível de serviço e balanço oferta × demanda**
1. Quais bases ficam desabastecidas em julho/2026, e quanto falta em volume e em dias de cobertura?
2. ARFIG e ARJOI não recebem nenhum volume: é falta de oferta, falta de rota ou decisão comercial?
3. Os 4.975 de oferta não distribuída (EVOLUA, INPASA, BARRALCOOL, PEDRO AFONSO) podem cobrir parte dos 12.506 de gap? Qual o custo incremental de redirecioná-los?
4. Sem a oferta parada, quanto volume spot ou de contrato adicional precisa ser comprado, e para quais bases?

**Custo e eficiência logística**
5. Por que BACRO, BAGAM, BACAJ, BAMAC, BAFOR e ARCAB custam mais de R$ 3.370/m³, enquanto BACAD e BEGON ficam abaixo de R$ 2.675/m³? Quanto disso é produto e quanto é frete?
6. Qual seria a economia se cada base fosse atendida pela origem de menor custo entregue (resolver como problema de transporte)?
7. CIF (56% do volume) é mais barato que FOB + frete próprio para as mesmas bases?
8. Existem cruzamentos de rota ineficientes, por exemplo usinas de SP abastecendo bases distantes enquanto há usinas mais próximas com sobra?

**Fornecedores e risco**
9. Qual a concentração por grupo (EVOLUA, INPASA, FS, COPERSUCAR, RAÍZEN etc.) e qual o impacto se o maior fornecedor falhar?
10. Quais bases dependem de um único fornecedor e precisam de contrato de backup?
11. Os contratos com Mínimo = Flat = Máximo deixam algum espaço de flexibilidade? Valeria negociar faixas de ±10% para absorver o gap?

**Planejamento e modelagem**
12. Qual a alocação ótima (mínimo custo total) respeitando oferta por contrato, demanda por base e restrições CIF/FOB, e quanto ela difere da alocação atual?
13. Qual o preço sombra (valor marginal) de 1 m³ adicional em cada base desabastecida?
14. Como a mistura obrigatória de anidro na gasolina C (demanda derivada da gasolina por base) bate com a demanda informada aqui?

## 4. Dados que faltam para análises mais fortes

- Custo por rota (fornecedor × base), não apenas por base; hoje só é possível ver o custo médio de chegada em cada base.
- Preço do produto e frete separados.
- Distância ou lead time de cada origem para cada base.
- Capacidade de tancagem e estoque inicial por base.
- Histórico de outros meses, para tendência e sazonalidade de safra.
