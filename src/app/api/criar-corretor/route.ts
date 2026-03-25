import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    // Verify the caller is authenticated
    const supabaseAuth = await createServerClient()
    const { data: { user: caller } } = await supabaseAuth.auth.getUser()
    if (!caller) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { nome, email, senha, workspaceId } = body

    if (!nome || !email || !senha || !workspaceId) {
      return NextResponse.json({ error: 'Preencha todos os campos' }, { status: 400 })
    }

    if (senha.length < 6) {
      return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 })
    }

    // Verify caller is dono of the workspace
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

    // Use admin client to create user (with service role key)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Create the user account
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })

    if (createError) {
      if (createError.message.includes('already been registered')) {
        return NextResponse.json({ error: 'Esse e-mail já está cadastrado no sistema' }, { status: 409 })
      }
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    if (!newUser.user) {
      return NextResponse.json({ error: 'Erro ao criar conta' }, { status: 500 })
    }

    // Add as corretor to the workspace
    const { error: memberError } = await supabaseAdmin
      .from('workspace_members')
      .insert({
        workspace_id: workspaceId,
        user_id: newUser.user.id,
        role: 'corretor',
      })

    if (memberError) {
      return NextResponse.json({ error: 'Conta criada mas erro ao adicionar à equipe: ' + memberError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user: { id: newUser.user.id, nome, email },
    })
  } catch (err) {
    console.error('Erro ao criar corretor:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
