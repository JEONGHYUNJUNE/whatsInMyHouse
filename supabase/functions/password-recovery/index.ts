import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { username, nickname, answer, newPassword } = await request.json()
    if (!/^[a-z0-9._-]{4,20}$/.test(String(username || '')) || String(nickname || '').trim().length < 1 || String(answer || '').trim().length < 2 || String(newPassword || '').length < 8) {
      return Response.json({ success: false, reason: 'invalid_input' }, { status: 400, headers: corsHeaders })
    }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: authUserId, error: verifyError } = await admin.rpc('verify_recovery_answer', { target_username: username, target_nickname: nickname, target_answer: answer })
    if (verifyError?.message.includes('recovery_temporarily_locked')) return Response.json({ success: false, reason: 'locked' }, { status: 429, headers: corsHeaders })
    if (verifyError || !authUserId) return Response.json({ success: false, reason: 'not_matched' }, { status: 400, headers: corsHeaders })
    const { error } = await admin.auth.admin.updateUserById(authUserId, { password: newPassword })
    if (error) throw error
    return Response.json({ success: true }, { headers: corsHeaders })
  } catch (error) {
    console.error('password recovery failed', error)
    return Response.json({ success: false, reason: 'server_error' }, { status: 500, headers: corsHeaders })
  }
})
