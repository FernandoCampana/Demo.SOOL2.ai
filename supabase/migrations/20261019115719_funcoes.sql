create or replace function public.executar_consulta_ia(p_sql text)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_sql text := btrim(p_sql);
  v_sem_textos text;
  v_limpo text;
  v_nomes text;
  v_ident text;
  v_permitidas text[] := array['cenarios', 'produtos', 'compensacao_tributaria', 'propriedades', 'tipos_veiculo', 'modais', 'regioes', 'fornecedores', 'clientes', 'clientes_uf', 'ofertas_fob', 'ofertas_fob_clientes', 'ofertas_cif', 'ofertas_cif_grupo', 'ofertas_cif_grupo_ofertas_cif', 'tipos_demanda', 'demandas', 'fretes_fc', 'restricoes_logisticas', 'restricoes_logisticas_clientes', 'restricoes_logisticas_produtos', 'restricoes_logisticas_modais', 'restricoes_logisticas_cc', 'restricoes_logisticas_clientes_origem', 'restricoes_logisticas_clientes_destino', 'restricoes_logisticas_produtos_cc', 'restricoes_logisticas_modais_cc', 'resultado_estoques', 'comparativo_resultados', 'comparativo_fornecedores', 'comparativo_clientes', 'comparativo_produtos', 'comparativo_modais', 'comparativo_clientes_produtos_resultados', 'comparativo_logistica_clientes_produtos_resultados', 'comparativo_clientes_produtos'];
  v_resultado json;
begin
  v_sql := regexp_replace(v_sql, ';\s*$', '');
  if v_sql ~ ';' then
    raise exception 'Apenas uma instrução SQL é permitida.';
  end if;
  if v_sql ~ '(--|/\*)' then
    raise exception 'Comentários não são permitidos na consulta.';
  end if;
  v_sem_textos := regexp_replace(v_sql, '''[^'']*''', '''''', 'g');
  v_limpo := lower(regexp_replace(v_sem_textos, '"[^"]*"', '"x"', 'g'));
  v_nomes := lower(replace(v_sem_textos, '"', ''));
  if v_limpo !~ '^\s*(select|with)\M' then
    raise exception 'A consulta deve começar com SELECT ou WITH.';
  end if;
  if v_limpo ~ '\m(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy|call|do|execute|vacuum|analyze|refresh|lock|listen|notify|set|reset|comment|security|prepare|deallocate|into)\M' then
    raise exception 'A consulta contém um comando não permitido.';
  end if;
  if v_limpo ~ '\m(pg_[a-z_]*|lo_[a-z_]*|dblink[a-z_]*|current_setting|set_config|query_to_xml|xpath|txid_[a-z_]*)\s*\(' then
    raise exception 'A consulta usa uma função de sistema não permitida.';
  end if;
  if v_nomes ~ '\m(auth|vault|storage|pg_catalog|information_schema|extensions|graphql|graphql_public|realtime|net|cron|supabase_functions|pgsodium)\s*\.' then
    raise exception 'A consulta acessa um schema não permitido.';
  end if;
  if v_nomes ~ '\mpg_[a-z0-9_]+' then
    raise exception 'A consulta acessa um objeto de sistema não permitido.';
  end if;
  for v_ident in
    select c.relname::text
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'v', 'm', 'p', 'f')
       and not (c.relname::text = any (v_permitidas))
  loop
    if v_nomes ~ ('\m' || v_ident || '\M') then
      raise exception 'Tabela não permitida na consulta: %', v_ident;
    end if;
  end loop;
  execute format('select coalesce(json_agg(q), ''[]''::json) from (select * from (%s) s limit 5000) q', v_sql)
    into v_resultado;
  return v_resultado;
end;
$$;
revoke execute on function public.executar_consulta_ia(text) from public, anon;
grant execute on function public.executar_consulta_ia(text) to authenticated;
create or replace function public.substituir_cenario(p_antigo uuid, p_novo uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tabela text;
  v_tabelas text[] := array['produtos', 'compensacao_tributaria', 'propriedades', 'tipos_veiculo', 'modais', 'regioes', 'fornecedores', 'clientes', 'clientes_uf', 'ofertas_fob', 'ofertas_fob_clientes', 'ofertas_cif', 'ofertas_cif_grupo', 'ofertas_cif_grupo_ofertas_cif', 'tipos_demanda', 'demandas', 'fretes_fc', 'restricoes_logisticas', 'restricoes_logisticas_clientes', 'restricoes_logisticas_produtos', 'restricoes_logisticas_modais', 'restricoes_logisticas_cc', 'restricoes_logisticas_clientes_origem', 'restricoes_logisticas_clientes_destino', 'restricoes_logisticas_produtos_cc', 'restricoes_logisticas_modais_cc', 'resultado_estoques', 'comparativo_resultados', 'comparativo_fornecedores', 'comparativo_clientes', 'comparativo_produtos', 'comparativo_modais', 'comparativo_clientes_produtos_resultados', 'comparativo_logistica_clientes_produtos_resultados', 'comparativo_clientes_produtos'];
  v_novo public.cenarios%rowtype;
begin
  if not exists (select 1 from public.cenarios where id = p_antigo and usuario_id = auth.uid()) then
    raise exception 'Cenário a substituir não encontrado ou sem permissão.';
  end if;
  select * into v_novo from public.cenarios where id = p_novo and usuario_id = auth.uid() and substitui_cenario_id = p_antigo;
  if not found then
    raise exception 'Cenário de atualização inválido.';
  end if;
  if v_novo.status <> 'concluido' then
    raise exception 'A importação do novo arquivo não foi concluída.';
  end if;
  set constraints all deferred;
  foreach v_tabela in array v_tabelas loop
    execute format('delete from public.%I where cenario_id = $1', v_tabela) using p_antigo;
  end loop;
  foreach v_tabela in array v_tabelas loop
    execute format('update public.%I set cenario_id = $1 where cenario_id = $2', v_tabela) using p_antigo, p_novo;
  end loop;
  update public.cenarios set
    descricao = v_novo.descricao,
    unidade_medida = v_novo.unidade_medida,
    horizonte_inicio = v_novo.horizonte_inicio,
    discretizacao = v_novo.discretizacao,
    numero_periodos = v_novo.numero_periodos,
    nome_arquivo = v_novo.nome_arquivo,
    caminho_arquivo_storage = v_novo.caminho_arquivo_storage,
    total_registros = v_novo.total_registros,
    status = 'concluido',
    atualizado_em = now()
  where id = p_antigo;
  delete from public.cenarios where id = p_novo;
end;
$$;
revoke execute on function public.substituir_cenario(uuid, uuid) from public, anon;
grant execute on function public.substituir_cenario(uuid, uuid) to authenticated;
create or replace function public.salvar_chave_ia(p_config_id uuid, p_chave text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
  v_mascara text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;
  select chave_api_secret_id into v_secret
    from public.configuracoes_ia
   where id = p_config_id and usuario_id = auth.uid();
  if not found then
    raise exception 'Configuração não encontrada.';
  end if;
  if coalesce(btrim(p_chave), '') = '' then
    raise exception 'Informe a chave de API.';
  end if;
  if v_secret is null then
    v_secret := vault.create_secret(btrim(p_chave), 'sool2ai_ia_' || p_config_id::text, 'Chave de API do SOOL2.ai');
  else
    perform vault.update_secret(v_secret, btrim(p_chave));
  end if;
  v_mascara := case when length(btrim(p_chave)) > 8 then left(btrim(p_chave), 3) || '...' || right(btrim(p_chave), 4) else '****' end;
  update public.configuracoes_ia
     set chave_api_secret_id = v_secret, chave_api_mascara = v_mascara
   where id = p_config_id;
  return v_mascara;
end;
$$;
revoke execute on function public.salvar_chave_ia(uuid, text) from public, anon;
grant execute on function public.salvar_chave_ia(uuid, text) to authenticated;
create or replace function public.ler_chave_ia(p_config_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text;
begin
  select s.decrypted_secret into v_chave
    from public.configuracoes_ia c
    join vault.decrypted_secrets s on s.id = c.chave_api_secret_id
   where c.id = p_config_id;
  return v_chave;
end;
$$;
revoke execute on function public.ler_chave_ia(uuid) from public, anon, authenticated;
grant execute on function public.ler_chave_ia(uuid) to service_role;;
