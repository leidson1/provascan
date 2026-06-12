import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function gerarToken(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let token = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) {
    token += chars[array[i] % chars.length]
  }
  return token
}

export async function POST(request: Request) {
  try {
    // Verificar autenticação
    const supabaseAuth = await createServerClient()
    const { data: { user: caller } } = await supabaseAuth.auth.getUser()
    if (!caller) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { email, workspaceId, role: inviteRole } = body
    const memberRole = inviteRole === 'coordenador' ? 'coordenador' : 'corretor'

    if (!email || !workspaceId) {
      return NextResponse.json({ error: 'Email e workspace são obrigatórios' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (typeof email !== 'string' || !emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }

    // Verificar que é dono do workspace
    const supabaseUser = await createServerClient()
    const { data: membership } = await supabaseUser
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', caller.id)
      .single()

    if (!membership || membership.role !== 'dono') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    // Admin client para buscar usuários
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Buscar se o email já tem conta via profiles
    let existingUser = null
    const { data: profileMatch } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, email')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (profileMatch) {
      existingUser = profileMatch
    }

    if (existingUser) {
      // Usuário já existe: só verificar se já faz parte da equipe
      const { data: existingMember } = await supabaseAdmin
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', existingUser.id)
        .maybeSingle()

      if (existingMember) {
        return NextResponse.json({ error: 'Este professor já faz parte da equipe' }, { status: 409 })
      }
    }

    // Sempre gerar convite — inclusive para quem já tem conta: entrar numa
    // equipe exige o aceite do próprio professor (a API de aceite valida que o
    // e-mail do convite é o do usuário logado). Quem já tem conta recebe link
    // de login; quem não tem, de cadastro.
    const origin = request.headers.get('origin') || ''
    const linkBase = existingUser ? '/login' : '/signup'
    const usuarioInfo = existingUser
      ? { nome: existingUser.nome, email: existingUser.email }
      : undefined

    // Verificar se já existe convite pendente para esse email nesse workspace
    const { data: existingInvite } = await supabaseAdmin
      .from('convites')
      .select('id, token')
      .eq('workspace_id', workspaceId)
      .eq('email', email.trim().toLowerCase())
      .eq('usado', false)
      .maybeSingle()

    if (existingInvite) {
      return NextResponse.json({
        success: true,
        tipo: 'convite',
        jaTemConta: !!existingUser,
        user: usuarioInfo,
        token: existingInvite.token,
        link: `${origin}${linkBase}?convite=${existingInvite.token}`,
      })
    }

    // Criar novo convite
    const token = gerarToken()
    const { error: inviteError } = await supabaseAdmin
      .from('convites')
      .insert({
        workspace_id: workspaceId,
        email: email.trim().toLowerCase(),
        token,
        criado_por: caller.id,
        role: memberRole,
      })

    if (inviteError) {
      return NextResponse.json({ error: 'Erro ao criar convite: ' + inviteError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      tipo: 'convite',
      jaTemConta: !!existingUser,
      user: usuarioInfo,
      token,
      link: `${origin}${linkBase}?convite=${token}`,
    })
  } catch (err) {
    console.error('Erro ao convidar corretor:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
