alter table public.cenarios add column if not exists estudo text;
comment on column public.cenarios.estudo is 'Estudo ao qual o cenário pertence (informado na inclusão; editável em Detalhes).';;
