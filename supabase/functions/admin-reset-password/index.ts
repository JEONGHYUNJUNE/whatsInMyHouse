import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = request.headers.get('Authorization') || ''
    const token = authorization.replace(/^Bearer\s+/i, '')
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
    const { data: actorData, error: actorError } = await admin.auth.getUser(token)
    if (actorError || !actorData.user) return Response.json({ success: false, reason: 'unauthorized' }, { status: 401, headers: corsHeaders })
    const { data: actorProfile } = await admin.from('profiles').select('is_admin').eq('auth_user_id', actorData.user.id).maybeSingle()
    if (!actorProfile?.is_admin) return Response.json({ success: false, reason: 'forbidden' }, { status: 403, headers: corsHeaders })
    const { username, action } = await request.json()
    const normalized = String(username || '').trim().toLowerCase()
    if (!/^[a-z0-9._-]{4,20}$/.test(normalized)) return Response.json({ success: false, reason: 'invalid_username' }, { status: 400, headers: corsHeaders })
    const { data: target } = await admin.from('profiles').select('auth_user_id, username, nickname, created_at').eq('username', normalized).maybeSingle()
    if (!target) return Response.json({ success: false, reason: 'not_found' }, { status: 404, headers: corsHeaders })
    if (action === 'search') return Response.json({ success: true, user: { username: target.username, nickname: target.nickname, createdAt: target.created_at } }, { headers: corsHeaders })
    if (action !== 'reset') return Response.json({ success: false, reason: 'invalid_action' }, { status: 400, headers: corsHeaders })
    const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, { password: normalized, user_metadata: { must_change_password: true } })
    if (error) throw error
    return Response.json({ success: true }, { headers: corsHeaders })
  } catch (error) {
    console.error('admin password reset failed', error)
    return Response.json({ success: false, reason: 'server_error' }, { status: 500, headers: corsHeaders })
  }
})
