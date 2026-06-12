import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Retorna APENAS o email do convite pendente, para prefill do signup.
// O RLS de `convites` bloqueia leitura anonima, por isso usamos service role.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token obrigatório' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: convite, error } = await supabaseAdmin
      .from('convites')
      .select('email')
      .eq('token', token)
      .eq('usado', false)
      .maybeSingle()

    if (error || !convite) {
      return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
    }

    return NextResponse.json({ email: convite.email })
  } catch (err) {
    console.error('Erro ao buscar convite:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
