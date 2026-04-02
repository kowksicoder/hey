do $$
begin
  if not exists (
    select 1
    from pg_enum enum_value
    inner join pg_type enum_type
      on enum_type.oid = enum_value.enumtypid
    where enum_type.typname = 'payment_provider'
      and enum_value.enumlabel = 'cngn'
  ) then
    alter type public.payment_provider add value 'cngn';
  end if;
end
$$;
