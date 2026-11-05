insert into storage.buckets (id, name, public)
values ('xml-cenarios', 'xml-cenarios', false)
on conflict (id) do nothing;
create policy xml_cenarios_ler on storage.objects for select to authenticated
  using (bucket_id = 'xml-cenarios');
create policy xml_cenarios_incluir on storage.objects for insert to authenticated
  with check (bucket_id = 'xml-cenarios' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy xml_cenarios_editar on storage.objects for update to authenticated
  using (bucket_id = 'xml-cenarios' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy xml_cenarios_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'xml-cenarios' and (storage.foldername(name))[1] = (select auth.uid())::text);;
