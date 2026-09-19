import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function serviceRoleKey() {
  return Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

Deno.serve(async (request) => {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return new Response('Unauthorized', {status: 401});
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: {headers: {Authorization: authorization}}
  });
  const {data: authData, error: authError} = await anon.auth.getUser();
  if (authError || !authData.user) return new Response('Unauthorized', {status: 401});
  const key = serviceRoleKey();
  if (!key) return new Response('Server user lookup is not configured', {status: 500});
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key);
  const {data: profile} = await admin.from('profiles').select('role,disabled').eq('id', authData.user.id).maybeSingle();
  if (!profile || profile.role !== 'admin' || profile.disabled) return new Response('Forbidden', {status: 403});
  const {data, error} = await admin.auth.admin.listUsers({page: 1, perPage: 1000});
  if (error) return new Response(error.message, {status: 500});
  return Response.json({users: data.users.map(user => ({id: user.id, email: user.email ?? null}))});
});
