import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function serviceRoleKey() {
  return Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

Deno.serve(async () => {
  const key = serviceRoleKey();
  if (!key) return new Response('Server cleanup is not configured', {status: 500});
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const {data, error} = await admin.from('profiles').select('id').eq('approval_status', 'pending').lt('created_at', cutoff);
  if (error) return new Response(error.message, {status: 500});
  for (const profile of data ?? []) {
    const {error: deleteError} = await admin.auth.admin.deleteUser(profile.id);
    if (deleteError) return new Response(deleteError.message, {status: 500});
  }
  return Response.json({expired: data?.length ?? 0});
});
