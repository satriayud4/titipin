import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env.local')

export const supabase = createClient(url, key)