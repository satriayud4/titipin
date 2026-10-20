
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return response({ error: 'Metode tidak diizinkan.' }, 405)
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!url || !anonKey || !serviceRoleKey) {
      console.error('Konfigurasi Supabase Function belum lengkap.')
      return response({ error: 'Konfigurasi server belum lengkap.' }, 500)
    }

    const body = await req.json()
    const identifier =
      typeof body.identifier === 'string' ? body.identifier.trim() : ''
    const password =
      typeof body.password === 'string' ? body.password : ''

    if (!identifier || !password) {
      return response(
        { error: 'Email/username atau kata sandi salah.' },
        400,
      )
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const authClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    let email = identifier

    if (!identifier.includes('@')) {
      const username = identifier.toLowerCase()

      if (!/^[a-z0-9_]{3,30}$/.test(username)) {
        return response(
          { error: 'Email/username atau kata sandi salah.' },
          401,
        )
      }

      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle()

      if (profileError) {
        console.error('Username lookup failed:', profileError.message)
        return response({ error: 'Gangguan server. Coba lagi.' }, 500)
      }

      if (!profile) {
        console.error('Username tidak ditemukan:', username)
        return response(
          { error: 'Email/username atau kata sandi salah.' },
          401,
        )
      }

      const { data: userData, error: userError } =
        await admin.auth.admin.getUserById(profile.id)

      if (userError || !userData.user?.email) {
        console.error('Gagal menemukan email akun:', userError?.message)
        return response(
          { error: 'Email/username atau kata sandi salah.' },
          401,
        )
      }

      email = userData.user.email
    }

    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.session) {
      console.error('Login gagal:', error?.message)
      return response(
        { error: 'Email/username atau kata sandi salah.' },
        401,
      )
    }

    return response({
      session: data.session,
      user: data.user,
    })
  } catch (error) {
    console.error(
      'Login Function error:',
      error instanceof Error ? error.message : 'Kesalahan tidak diketahui',
    )

    return response({ error: 'Terjadi gangguan server. Coba lagi.' }, 500)
  }
})
