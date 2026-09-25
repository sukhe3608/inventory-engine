do $cron$
begin
  if not exists (select 1 from cron.job where jobname = 'outbox-dispatch-every-minute') then
    perform cron.schedule(
      'outbox-dispatch-every-minute',
      '* * * * *',
      $cmd$ select public.dispatch_outbox(50); $cmd$
    );
  end if;
end
$cron$;