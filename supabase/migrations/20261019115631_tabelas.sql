create table public.perfis (
 id uuid primary key references auth.users (id) on delete cascade,
 nome text not null,
 email text not null,
 criado_em timestamptz not null default now()
);
comment on table public.perfis is 'Dados de exibição dos usuários (usado em "Incluído por"). Criado por trigger no cadastro.';
create table public.cenarios (
 id uuid primary key default gen_random_uuid(),
 nome text not null,
 descricao text,
 unidade_medida text,
 horizonte_inicio date,
 discretizacao text,
 numero_periodos integer,
 nome_arquivo text not null,
 data_importacao timestamptz not null default now(),
 atualizado_em timestamptz,
 caminho_arquivo_storage text,
 status text not null default 'importando' check (status in ('importando', 'atualizando', 'concluido', 'erro')),
 total_registros integer,
 usuario_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
 substitui_cenario_id uuid references public.cenarios (id) on delete cascade
);
create index cenarios_usuario_idx on public.cenarios (usuario_id);
create index cenarios_substitui_idx on public.cenarios (substitui_cenario_id);
comment on column public.cenarios.atualizado_em is 'Data e hora da última atualização (reimportação).';
comment on column public.cenarios.caminho_arquivo_storage is 'Caminho do XML original no bucket xml-cenarios.';
comment on column public.cenarios.substitui_cenario_id is 'Preenchido apenas durante uma atualização: cenário temporário que vai substituir o indicado.';
create table public.produtos (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 nome text,
 custo_estoque numeric,
 constraint produtos_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint produtos_uk1 unique (cenario_id, codigo)
);
create table public.compensacao_tributaria (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 uf_origem char(2) not null,
 produto text not null,
 uf_destino char(2) not null,
 valor numeric,
 constraint compensacao_tributaria_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint compensacao_tributaria_uk1 unique (cenario_id, uf_origem, produto, uf_destino),
 constraint compensacao_tributaria_fk1 foreign key (cenario_id, produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index compensacao_tributaria_idx1 on public.compensacao_tributaria (cenario_id, produto);
create table public.propriedades (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 nome text,
 constraint propriedades_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint propriedades_uk1 unique (cenario_id, codigo)
);
create table public.tipos_veiculo (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 numero_eixos integer not null,
 capacidade numeric,
 constraint tipos_veiculo_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint tipos_veiculo_uk1 unique (cenario_id, numero_eixos)
);
create table public.modais (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 nome text,
 calcular_distancia_tempo boolean,
 custo_km numeric,
 considerar_custo_km_frete boolean,
 constraint modais_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint modais_uk1 unique (cenario_id, codigo)
);
create table public.regioes (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 regiao_origem text not null,
 regiao_destino text not null,
 valor numeric,
 constraint regioes_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint regioes_uk1 unique (cenario_id, regiao_origem, regiao_destino)
);
create table public.fornecedores (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 nome text,
 municipio text,
 cnpj text,
 latitude numeric,
 longitude numeric,
 constraint fornecedores_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint fornecedores_uk1 unique (cenario_id, codigo)
);
create table public.clientes (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 nome text,
 municipio text,
 cnpj text,
 latitude numeric,
 longitude numeric,
 prioridade integer,
 constraint clientes_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint clientes_uk1 unique (cenario_id, codigo)
);
create table public.clientes_uf (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo_cliente text not null,
 produto text not null,
 uf char(2) not null,
 recebe boolean,
 constraint clientes_uf_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint clientes_uf_uk1 unique (cenario_id, codigo_cliente, produto, uf),
 constraint clientes_uf_fk1 foreign key (cenario_id, codigo_cliente) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint clientes_uf_fk2 foreign key (cenario_id, produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index clientes_uf_idx1 on public.clientes_uf (cenario_id, produto);
create table public.ofertas_fob (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 fornecedor text not null,
 produto text not null,
 periodo integer,
 abrangencia text,
 limite_superior_fora_estado_percentual numeric,
 quantidade_2 numeric,
 limite_inferior numeric,
 quantidade numeric,
 limite_superior numeric,
 preco numeric,
 indice_preco text,
 premio numeric,
 desconto numeric,
 diferencial_logistico numeric,
 situacao_oferta text,
 resultado_otimizacao numeric,
 codigo_moeda text,
 codigo_moeda_referencia text,
 create_date timestamp,
 bid numeric,
 ask numeric,
 high numeric,
 low numeric,
 constraint ofertas_fob_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint ofertas_fob_uk1 unique (cenario_id, codigo),
 constraint ofertas_fob_fk1 foreign key (cenario_id, fornecedor) references public.fornecedores (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint ofertas_fob_fk2 foreign key (cenario_id, produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index ofertas_fob_idx1 on public.ofertas_fob (cenario_id, fornecedor);
create index ofertas_fob_idx2 on public.ofertas_fob (cenario_id, produto);
create table public.ofertas_fob_clientes (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo_oferta text not null,
 codigo_cliente text not null,
 constraint ofertas_fob_clientes_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint ofertas_fob_clientes_uk1 unique (cenario_id, codigo_oferta, codigo_cliente),
 constraint ofertas_fob_clientes_fk1 foreign key (cenario_id, codigo_oferta) references public.ofertas_fob (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint ofertas_fob_clientes_fk2 foreign key (cenario_id, codigo_cliente) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index ofertas_fob_clientes_idx1 on public.ofertas_fob_clientes (cenario_id, codigo_cliente);
create table public.ofertas_cif (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 fornecedor text not null,
 cliente text not null,
 modal text,
 produto text not null,
 periodo integer,
 limite_inferior numeric,
 quantidade numeric,
 limite_superior numeric,
 preco numeric,
 indice_preco text,
 premio numeric,
 desconto numeric,
 diferencial_logistico numeric,
 situacao_oferta text,
 resultado_otimizacao numeric,
 codigo_moeda text,
 codigo_moeda_referencia text,
 create_date timestamp,
 bid numeric,
 ask numeric,
 high numeric,
 low numeric,
 constraint ofertas_cif_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint ofertas_cif_uk1 unique (cenario_id, codigo),
 constraint ofertas_cif_fk1 foreign key (cenario_id, fornecedor) references public.fornecedores (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint ofertas_cif_fk2 foreign key (cenario_id, cliente) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint ofertas_cif_fk3 foreign key (cenario_id, modal) references public.modais (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint ofertas_cif_fk4 foreign key (cenario_id, produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index ofertas_cif_idx1 on public.ofertas_cif (cenario_id, fornecedor);
create index ofertas_cif_idx2 on public.ofertas_cif (cenario_id, cliente);
create index ofertas_cif_idx3 on public.ofertas_cif (cenario_id, modal);
create index ofertas_cif_idx4 on public.ofertas_cif (cenario_id, produto);
create table public.ofertas_cif_grupo (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 nome text,
 fornecedor text not null,
 produto text not null,
 cliente text not null,
 modal text,
 periodo_de integer,
 periodo_ate integer,
 limite_inferior numeric,
 quantidade numeric,
 limite_superior numeric,
 preco numeric,
 indice_preco text,
 premio numeric,
 desconto numeric,
 diferencial_logistico numeric,
 situacao_oferta text,
 resultado_otimizacao numeric,
 codigo_moeda text,
 codigo_moeda_referencia text,
 create_date timestamp,
 bid numeric,
 ask numeric,
 high numeric,
 low numeric,
 constraint ofertas_cif_grupo_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint ofertas_cif_grupo_uk1 unique (cenario_id, codigo),
 constraint ofertas_cif_grupo_fk1 foreign key (cenario_id, fornecedor) references public.fornecedores (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint ofertas_cif_grupo_fk2 foreign key (cenario_id, cliente) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint ofertas_cif_grupo_fk3 foreign key (cenario_id, modal) references public.modais (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint ofertas_cif_grupo_fk4 foreign key (cenario_id, produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index ofertas_cif_grupo_idx1 on public.ofertas_cif_grupo (cenario_id, fornecedor);
create index ofertas_cif_grupo_idx2 on public.ofertas_cif_grupo (cenario_id, cliente);
create index ofertas_cif_grupo_idx3 on public.ofertas_cif_grupo (cenario_id, modal);
create index ofertas_cif_grupo_idx4 on public.ofertas_cif_grupo (cenario_id, produto);
create table public.ofertas_cif_grupo_ofertas_cif (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo_grupo text not null,
 codigo_oferta text not null,
 constraint ofertas_cif_grupo_ofertas_cif_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint ofertas_cif_grupo_ofertas_cif_uk1 unique (cenario_id, codigo_grupo, codigo_oferta),
 constraint ofertas_cif_grupo_ofertas_cif_fk1 foreign key (cenario_id, codigo_grupo) references public.ofertas_cif_grupo (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint ofertas_cif_grupo_ofertas_cif_fk2 foreign key (cenario_id, codigo_oferta) references public.ofertas_cif (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index ofertas_cif_grupo_ofertas_cif_idx1 on public.ofertas_cif_grupo_ofertas_cif (cenario_id, codigo_oferta);
create table public.tipos_demanda (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 nome text,
 prioridade integer,
 constraint tipos_demanda_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint tipos_demanda_uk1 unique (cenario_id, codigo)
);
create table public.demandas (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 cliente text not null,
 produto text not null,
 periodo integer not null,
 limite_inferior numeric,
 limite_superior numeric,
 demanda_atendida numeric,
 demanda_tipo text,
 constraint demandas_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint demandas_uk1 unique (cenario_id, cliente, produto, periodo, demanda_tipo),
 constraint demandas_fk1 foreign key (cenario_id, cliente) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint demandas_fk2 foreign key (cenario_id, produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint demandas_fk3 foreign key (cenario_id, demanda_tipo) references public.tipos_demanda (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index demandas_idx1 on public.demandas (cenario_id, produto);
create index demandas_idx2 on public.demandas (cenario_id, demanda_tipo);
create table public.fretes_fc (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 origem text not null,
 destino text not null,
 modal text not null,
 produto text,
 valor numeric,
 valor_estimado numeric,
 tipo_frete_estimado text,
 limite_minimo numeric,
 limite_maximo numeric,
 ativo boolean,
 codigo_frete_mais_proximo text,
 lead_time integer,
 constraint fretes_fc_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint fretes_fc_uk1 unique (cenario_id, codigo),
 constraint fretes_fc_fk1 foreign key (cenario_id, origem) references public.fornecedores (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint fretes_fc_fk2 foreign key (cenario_id, destino) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint fretes_fc_fk3 foreign key (cenario_id, modal) references public.modais (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint fretes_fc_fk4 foreign key (cenario_id, produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index fretes_fc_idx1 on public.fretes_fc (cenario_id, origem);
create index fretes_fc_idx2 on public.fretes_fc (cenario_id, destino);
create index fretes_fc_idx3 on public.fretes_fc (cenario_id, modal);
create index fretes_fc_idx4 on public.fretes_fc (cenario_id, produto);
create index fretes_fc_idx5 on public.fretes_fc (cenario_id, origem, destino, modal);
create table public.restricoes_logisticas (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 descricao text,
 limite_inferior numeric,
 limite_superior numeric,
 ativa boolean,
 forte boolean,
 distribuida boolean,
 periodo_de integer,
 periodo_ate integer,
 custo_top numeric,
 constraint restricoes_logisticas_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_uk1 unique (cenario_id, codigo)
);
create table public.restricoes_logisticas_clientes (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo_restricao text not null,
 codigo_cliente text not null,
 constraint restricoes_logisticas_clientes_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_clientes_uk1 unique (cenario_id, codigo_restricao, codigo_cliente),
 constraint restricoes_logisticas_clientes_fk1 foreign key (cenario_id, codigo_restricao) references public.restricoes_logisticas (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_clientes_fk2 foreign key (cenario_id, codigo_cliente) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index restricoes_logisticas_clientes_idx1 on public.restricoes_logisticas_clientes (cenario_id, codigo_cliente);
create table public.restricoes_logisticas_produtos (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo_restricao text not null,
 codigo_produto text not null,
 constraint restricoes_logisticas_produtos_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_produtos_uk1 unique (cenario_id, codigo_restricao, codigo_produto),
 constraint restricoes_logisticas_produtos_fk1 foreign key (cenario_id, codigo_restricao) references public.restricoes_logisticas (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_produtos_fk2 foreign key (cenario_id, codigo_produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index restricoes_logisticas_produtos_idx1 on public.restricoes_logisticas_produtos (cenario_id, codigo_produto);
create table public.restricoes_logisticas_modais (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo_restricao text not null,
 codigo_modal text not null,
 constraint restricoes_logisticas_modais_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_modais_uk1 unique (cenario_id, codigo_restricao, codigo_modal),
 constraint restricoes_logisticas_modais_fk1 foreign key (cenario_id, codigo_restricao) references public.restricoes_logisticas (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_modais_fk2 foreign key (cenario_id, codigo_modal) references public.modais (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index restricoes_logisticas_modais_idx1 on public.restricoes_logisticas_modais (cenario_id, codigo_modal);
create table public.restricoes_logisticas_cc (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 descricao text,
 limite_inferior numeric,
 limite_superior numeric,
 ativa boolean,
 forte boolean,
 distribuida boolean,
 periodo_de integer,
 periodo_ate integer,
 custo_top numeric,
 constraint restricoes_logisticas_cc_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_cc_uk1 unique (cenario_id, codigo)
);
create table public.restricoes_logisticas_clientes_origem (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo_restricao text not null,
 codigo_cliente_origem text not null,
 constraint restricoes_logisticas_clientes_origem_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_clientes_origem_uk1 unique (cenario_id, codigo_restricao, codigo_cliente_origem),
 constraint restricoes_logisticas_clientes_origem_fk1 foreign key (cenario_id, codigo_restricao) references public.restricoes_logisticas_cc (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_clientes_origem_fk2 foreign key (cenario_id, codigo_cliente_origem) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index restricoes_logisticas_clientes_origem_idx1 on public.restricoes_logisticas_clientes_origem (cenario_id, codigo_cliente_origem);
create table public.restricoes_logisticas_clientes_destino (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo_restricao text not null,
 codigo_cliente_destino text not null,
 constraint restricoes_logisticas_clientes_destino_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_clientes_destino_uk1 unique (cenario_id, codigo_restricao, codigo_cliente_destino),
 constraint restricoes_logisticas_clientes_destino_fk1 foreign key (cenario_id, codigo_restricao) references public.restricoes_logisticas_cc (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_clientes_destino_fk2 foreign key (cenario_id, codigo_cliente_destino) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index restricoes_logisticas_clientes_destino_idx1 on public.restricoes_logisticas_clientes_destino (cenario_id, codigo_cliente_destino);
create table public.restricoes_logisticas_produtos_cc (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo_restricao text not null,
 codigo_produto text not null,
 constraint restricoes_logisticas_produtos_cc_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_produtos_cc_uk1 unique (cenario_id, codigo_restricao, codigo_produto),
 constraint restricoes_logisticas_produtos_cc_fk1 foreign key (cenario_id, codigo_restricao) references public.restricoes_logisticas_cc (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_produtos_cc_fk2 foreign key (cenario_id, codigo_produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index restricoes_logisticas_produtos_cc_idx1 on public.restricoes_logisticas_produtos_cc (cenario_id, codigo_produto);
create table public.restricoes_logisticas_modais_cc (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo_restricao text not null,
 codigo_modal text not null,
 constraint restricoes_logisticas_modais_cc_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_modais_cc_uk1 unique (cenario_id, codigo_restricao, codigo_modal),
 constraint restricoes_logisticas_modais_cc_fk1 foreign key (cenario_id, codigo_restricao) references public.restricoes_logisticas_cc (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint restricoes_logisticas_modais_cc_fk2 foreign key (cenario_id, codigo_modal) references public.modais (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index restricoes_logisticas_modais_cc_idx1 on public.restricoes_logisticas_modais_cc (cenario_id, codigo_modal);
create table public.resultado_estoques (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 cliente text not null,
 produto text not null,
 periodo integer not null,
 quantidade numeric,
 estoque_minimo numeric,
 estoque_minimo_seguranca numeric,
 estoque_maximo_seguranca numeric,
 estoque_maximo numeric,
 custo numeric,
 valor numeric,
 consumo_estoque numeric,
 variacao_estoque numeric,
 constraint resultado_estoques_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint resultado_estoques_uk1 unique (cenario_id, cliente, produto, periodo),
 constraint resultado_estoques_fk1 foreign key (cenario_id, cliente) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint resultado_estoques_fk2 foreign key (cenario_id, produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index resultado_estoques_idx1 on public.resultado_estoques (cenario_id, produto);
create table public.comparativo_resultados (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 descricao text,
 e_referencia boolean,
 constraint comparativo_resultados_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint comparativo_resultados_uk1 unique (cenario_id, codigo)
);
create table public.comparativo_fornecedores (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 nome text,
 codigo_municipio text,
 latitude numeric,
 longitude numeric,
 codigo_resultado text not null,
 constraint comparativo_fornecedores_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint comparativo_fornecedores_uk1 unique (cenario_id, codigo, codigo_resultado),
 constraint comparativo_fornecedores_fk1 foreign key (cenario_id, codigo) references public.fornecedores (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint comparativo_fornecedores_fk2 foreign key (cenario_id, codigo_resultado) references public.comparativo_resultados (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index comparativo_fornecedores_idx1 on public.comparativo_fornecedores (cenario_id, codigo_resultado);
create table public.comparativo_clientes (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 nome text,
 codigo_municipio text,
 latitude numeric,
 longitude numeric,
 codigo_resultado text not null,
 constraint comparativo_clientes_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint comparativo_clientes_uk1 unique (cenario_id, codigo, codigo_resultado),
 constraint comparativo_clientes_fk1 foreign key (cenario_id, codigo) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint comparativo_clientes_fk2 foreign key (cenario_id, codigo_resultado) references public.comparativo_resultados (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index comparativo_clientes_idx1 on public.comparativo_clientes (cenario_id, codigo_resultado);
create table public.comparativo_produtos (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 nome text,
 codigo_resultado text not null,
 constraint comparativo_produtos_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint comparativo_produtos_uk1 unique (cenario_id, codigo, codigo_resultado),
 constraint comparativo_produtos_fk1 foreign key (cenario_id, codigo) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint comparativo_produtos_fk2 foreign key (cenario_id, codigo_resultado) references public.comparativo_resultados (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index comparativo_produtos_idx1 on public.comparativo_produtos (cenario_id, codigo_resultado);
create table public.comparativo_modais (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo text not null,
 nome text,
 codigo_resultado text not null,
 constraint comparativo_modais_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint comparativo_modais_uk1 unique (cenario_id, codigo, codigo_resultado),
 constraint comparativo_modais_fk1 foreign key (cenario_id, codigo) references public.modais (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint comparativo_modais_fk2 foreign key (cenario_id, codigo_resultado) references public.comparativo_resultados (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index comparativo_modais_idx1 on public.comparativo_modais (cenario_id, codigo_resultado);
create table public.comparativo_clientes_produtos_resultados (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo_cliente text not null,
 codigo_produto text not null,
 demanda numeric,
 demanda_atendida numeric,
 custo_total numeric,
 custo_aquisicao numeric,
 custo_transporte numeric,
 custo_passagem numeric,
 receita_envio numeric,
 preco_medio numeric,
 recebido numeric,
 enviado numeric,
 codigo_resultado text not null,
 constraint comparativo_clientes_produtos_resultados_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint comparativo_clientes_produtos_resultados_uk1 unique (cenario_id, codigo_cliente, codigo_produto, codigo_resultado),
 constraint comparativo_clientes_produtos_resultados_fk1 foreign key (cenario_id, codigo_cliente) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint comparativo_clientes_produtos_resultados_fk2 foreign key (cenario_id, codigo_produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint comparativo_clientes_produtos_resultados_fk3 foreign key (cenario_id, codigo_resultado) references public.comparativo_resultados (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index comparativo_clientes_produtos_resultados_idx1 on public.comparativo_clientes_produtos_resultados (cenario_id, codigo_produto);
create index comparativo_clientes_produtos_resultados_idx2 on public.comparativo_clientes_produtos_resultados (cenario_id, codigo_resultado);
create table public.comparativo_logistica_clientes_produtos_resultados (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 tipo_frete text,
 incoterms text not null,
 codigo_origem text not null,
 codigo_destino text not null,
 codigo_produto text not null,
 codigo_modal text,
 resultado numeric,
 preco numeric,
 preco_frete numeric,
 cpu numeric,
 ctu numeric,
 custo_unitario numeric,
 custo_aquisicao numeric,
 custo_transporte numeric,
 custo_passagem numeric,
 compensacao_tributaria numeric,
 custo_total numeric,
 codigo_resultado text not null,
 constraint comparativo_logistica_clientes_produtos_resultados_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint comparativo_logistica_clientes_produtos_resultados_uk1 unique (cenario_id, incoterms, codigo_origem, codigo_destino, codigo_produto, codigo_modal, codigo_resultado),
 constraint comparativo_logistica_clientes_produtos_resultados_fk1 foreign key (cenario_id, codigo_destino) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint comparativo_logistica_clientes_produtos_resultados_fk2 foreign key (cenario_id, codigo_produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint comparativo_logistica_clientes_produtos_resultados_fk3 foreign key (cenario_id, codigo_modal) references public.modais (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint comparativo_logistica_clientes_produtos_resultados_fk4 foreign key (cenario_id, codigo_resultado) references public.comparativo_resultados (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index comparativo_logistica_clientes_produtos_resultados_idx1 on public.comparativo_logistica_clientes_produtos_resultados (cenario_id, codigo_destino);
create index comparativo_logistica_clientes_produtos_resultados_idx2 on public.comparativo_logistica_clientes_produtos_resultados (cenario_id, codigo_produto);
create index comparativo_logistica_clientes_produtos_resultados_idx3 on public.comparativo_logistica_clientes_produtos_resultados (cenario_id, codigo_modal);
create index comparativo_logistica_clientes_produtos_resultados_idx4 on public.comparativo_logistica_clientes_produtos_resultados (cenario_id, codigo_resultado);
create index comparativo_logistica_clientes_produtos_resultados_idx5 on public.comparativo_logistica_clientes_produtos_resultados (cenario_id, codigo_origem);
create table public.comparativo_clientes_produtos (
 id bigint generated always as identity primary key,
 cenario_id uuid not null,
 codigo_cliente text not null,
 codigo_produto text not null,
 preco_referencia numeric,
 codigo_resultado text not null,
 constraint comparativo_clientes_produtos_cenario_fk foreign key (cenario_id) references public.cenarios (id) on delete cascade deferrable initially immediate,
 constraint comparativo_clientes_produtos_uk1 unique (cenario_id, codigo_cliente, codigo_produto, codigo_resultado),
 constraint comparativo_clientes_produtos_fk1 foreign key (cenario_id, codigo_cliente) references public.clientes (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint comparativo_clientes_produtos_fk2 foreign key (cenario_id, codigo_produto) references public.produtos (cenario_id, codigo) on delete cascade deferrable initially immediate,
 constraint comparativo_clientes_produtos_fk3 foreign key (cenario_id, codigo_resultado) references public.comparativo_resultados (cenario_id, codigo) on delete cascade deferrable initially immediate
);
create index comparativo_clientes_produtos_idx1 on public.comparativo_clientes_produtos (cenario_id, codigo_produto);
create index comparativo_clientes_produtos_idx2 on public.comparativo_clientes_produtos (cenario_id, codigo_resultado);
create table public.configuracoes_ia (
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
 nome text not null,
 provedor text not null check (provedor in ('anthropic', 'openai', 'google_gemini', 'azure_openai', 'compativel_openai')),
 modelo text not null,
 url_base text,
 nome_deployment text,
 versao_api text,
 chave_api_secret_id uuid,
 chave_api_mascara text,
 temperatura numeric check (temperatura is null or (temperatura >= 0 and temperatura <= 2)),
 limite_tokens integer not null default 4096 check (limite_tokens between 256 and 64000),
 padrao boolean not null default false,
 criado_em timestamptz not null default now(),
 atualizado_em timestamptz not null default now()
);
create unique index configuracoes_ia_padrao_uk on public.configuracoes_ia (usuario_id) where padrao;
comment on table public.configuracoes_ia is 'Configurações das plataformas de IA usadas nas perguntas. A chave fica no Supabase Vault.';
comment on column public.configuracoes_ia.temperatura is 'Vazio = padrão do modelo (alguns modelos recentes não aceitam outro valor).';
create table public.historico_perguntas (
 id bigint generated always as identity primary key,
 usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
 pergunta text not null,
 cenarios_ids uuid[],
 configuracao_ia_id uuid references public.configuracoes_ia (id) on delete set null,
 sql_gerado text,
 formato_resultado text,
 especificacao_visual jsonb,
 resposta text,
 destaques jsonb,
 dados jsonb,
 linhas_retornadas integer,
 tempo_execucao_ms integer,
 erro text,
 criado_em timestamptz not null default now()
);
create index historico_perguntas_usuario_idx on public.historico_perguntas (usuario_id, criado_em desc);
comment on table public.historico_perguntas is 'Histórico de perguntas com SQL, formato, especificação visual e amostra dos dados (até 1.000 linhas).';
create table public.parametros_mistura (
 id bigint generated always as identity primary key,
 usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
 produto_final text not null,
 componente text not null,
 percentual numeric not null check (percentual >= 0 and percentual <= 100),
 referencia text,
 vigencia_inicio date,
 atualizado_em timestamptz not null default now()
);
create index parametros_mistura_usuario_idx on public.parametros_mistura (usuario_id);
comment on table public.parametros_mistura is 'Percentuais de mistura obrigatória editáveis em Configurações.';;
