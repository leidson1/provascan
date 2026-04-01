import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    // Verificar autenticação
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
    }

    // Admin client para acessar convites
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Buscar convite pelo token
    const { data: convite, error: conviteError } = await supabaseAdmin
      .from('convites')
      .select('*')
      .eq('token', token)
      .eq('usado', false)
      .maybeSingle()

    if (conviteError || !convite) {
      return NextResponse.json({ error: 'Convite inválido ou já utilizado' }, { status: 404 })
    }

    // Verificar se o email do convite bate com o do usuário
    if (convite.email !== user.email?.toLowerCase()) {
      return NextResponse.json({
        error: 'Este convite foi enviado para outro email',
      }, { status: 403 })
    }

    // Verificar se já é membro
    const { data: existingMember } = await supabaseAdmin
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', convite.workspace_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMember) {
      // Já é membro, só marcar convite como usado
      await supabaseAdmin
        .from('convites')
        .update({ usado: true })
        .eq('id', convite.id)

      return NextResponse.json({ success: true, message: 'Você já faz parte desta equipe' })
    }

    // Adicionar como corretor
    const { error: memberError } = await supabaseAdmin
      .from('workspace_members')
      .insert({
        workspace_id: convite.workspace_id,
        user_id: user.id,
        role: 'corretor',
      })

    if (memberError) {
      return NextResponse.json({ error: 'Erro ao aceitar convite: ' + memberError.message }, { status: 500 })
    }

    // Marcar convite como usado
    await supabaseAdmin
      .from('convites')
      .update({ usado: true })
      .eq('id', convite.id)

    return NextResponse.json({ success: true, message: 'Convite aceito! Você foi adicionado à equipe.' })
  } catch (err) {
    console.error('Erro ao aceitar convite:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
