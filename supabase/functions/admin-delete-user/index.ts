import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function serviceRoleKey() {
  return Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function response(body: string, status: number, contentType = 'text/plain') {
  return new Response(body, {status, headers: {...corsHeaders, 'Content-Type': contentType}});
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  const authorization = request.headers.get('Authorization');
  if (!authorization) return response('Unauthorized', 401);
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: {headers: {Authorization: authorization}}
  });
  const {data: authData, error: authError} = await anon.auth.getUser();
  if (authError || !authData.user) return response('Unauthorized', 401);
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  if (!userId) return response('userId is required', 400);

  const key = serviceRoleKey();
  if (!key) return response('Server deletion is not configured', 500);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key);
  const {data: actor, error: actorError} = await admin.from('profiles').select('role,disabled').eq('id', authData.user.id).maybeSingle();
  if (actorError) return response('Could not verify administrator', 500);
  if (!actor || actor.role !== 'admin' || actor.disabled) return response('Forbidden', 403);
  if (userId === authData.user.id) return response('The active admin cannot delete itself', 400);

  const {data: target, error: targetError} = await admin.from('profiles').select('id,role').eq('id', userId).maybeSingle();
  if (targetError) return response('Could not find target user', 500);
  if (!target || target.role !== 'premium') return response('Premium user not found', 404);
  const {error} = await admin.auth.admin.deleteUser(userId);
  if (error) return response(error.message, 500);
  return new Response(JSON.stringify({deleted: userId}), {headers: {...corsHeaders, 'Content-Type': 'application/json'}});
});
