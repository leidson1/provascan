"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, ScanLine, UserPlus } from "lucide-react";

function buildInvitePath(basePath: string, conviteToken: string | null) {
  if (!conviteToken) return basePath;

  const params = new URLSearchParams({ convite: conviteToken });
  return `${basePath}?${params.toString()}`;
}

function SignUpForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const conviteToken = searchParams.get("convite");

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conviteInfo, setConviteInfo] = useState<{ email: string } | null>(null);

  const loginPath = buildInvitePath("/login", conviteToken);
  const acceptInvitePath = buildInvitePath("/aceitar-convite", conviteToken);

  useEffect(() => {
    if (!conviteToken) return;

    let active = true;
    const supabase = createClient();

    async function checkUser() {
      const response = await supabase.auth.getUser();
      const user = response.data.user;
      if (!active || !user) return;
      router.replace(acceptInvitePath);
    }

    checkUser().catch((error) => {
      console.error("Erro ao verificar usuario autenticado:", error);
    });

    return () => {
      active = false;
    };
  }, [acceptInvitePath, conviteToken, router]);

  useEffect(() => {
    if (!conviteToken) return;

    const supabase = createClient();
    supabase
      .from("convites")
      .select("email")
      .eq("token", conviteToken)
      .eq("usado", false)
      .maybeSingle()
      .then(({ data }: { data: { email: string } | null }) => {
        if (!data) return;
        setConviteInfo({ email: data.email });
        setEmail(data.email);
      });
  }, [conviteToken]);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    const acceptedTermsAt = new Date().toISOString();

    if (password !== confirmPassword) {
      toast.error("As senhas nao coincidem");
      return;
    }

    if (!acceptedTerms) {
      toast.error("Voce precisa aceitar os Termos de Uso");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome,
          accepted_terms_at: acceptedTermsAt,
        },
      },
    });

    if (error) {
      let msg = error.message;
      if (error.message.includes("already registered")) {
        msg = conviteToken
          ? "Este email ja tem conta. Faca login para aceitar o convite."
          : "Este email ja esta cadastrado. Tente fazer login.";
      } else if (error.message.includes("Password should be")) {
        msg = "A senha deve ter pelo menos 6 caracteres.";
      }
      toast.error("Erro ao criar conta", {
        description: msg,
      });
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ accepted_terms_at: acceptedTermsAt })
        .eq("id", data.user.id);

      if (profileError) {
        console.error("Erro ao registrar aceite dos termos:", profileError);
      }
    }

    if (conviteToken) {
      try {
        const res = await fetch("/api/aceitar-convite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: conviteToken }),
        });
        const data = await res.json();

        if (res.ok) {
          toast.success("Conta criada e convite aceito!", {
            description: "Voce ja faz parte da equipe.",
          });
          router.push("/dashboard");
          setLoading(false);
          return;
        }

        console.error("Erro ao aceitar convite:", data.error);
      } catch {
        console.error("Erro ao aceitar convite");
      }

      toast.success("Conta criada com sucesso!", {
        description: "Vamos concluir o convite na sequencia.",
      });
      router.push(acceptInvitePath);
      setLoading(false);
      return;
    }

    toast.success("Conta criada com sucesso!");
    router.push("/dashboard");
    setLoading(false);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-2 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <ScanLine className="h-8 w-8 text-indigo-500" />
          <span className="text-2xl font-bold tracking-tight">ProvaScan</span>
        </div>
        <CardTitle className="text-xl">
          {conviteToken ? "Aceitar Convite" : "Criar conta"}
        </CardTitle>
        <CardDescription>
          {conviteToken
            ? "Crie sua conta para entrar na equipe"
            : "Preencha os dados abaixo para se cadastrar"}
        </CardDescription>
      </CardHeader>

      {conviteToken && conviteInfo && (
        <div className="mx-6 mb-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <UserPlus className="h-4 w-4 shrink-0 text-blue-500" />
          <p className="text-xs text-blue-700">
            Voce foi convidado(a) para uma equipe no ProvaScan. Se este email ja
            existir, faca login para aceitar.
          </p>
        </div>
      )}

      <form onSubmit={handleSignUp}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              type="text"
              placeholder="Seu nome completo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar Senha</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="********"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div className="flex items-start gap-2">
            <input
              id="terms"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border accent-indigo-500"
            />
            <Label htmlFor="terms" className="text-sm font-normal leading-snug">
              Li e aceito os{" "}
              <Link
                href="/termos"
                className="font-medium text-indigo-500 underline transition-colors hover:text-indigo-400"
                target="_blank"
              >
                Termos de Uso e Politica de Privacidade
              </Link>
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading
              ? "Criando conta..."
              : conviteToken
                ? "Criar Conta e Aceitar Convite"
                : "Criar Conta"}
          </Button>
        </CardContent>
      </form>

      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Ja tem conta?{" "}
          <Link
            href={loginPath}
            className="font-medium text-indigo-500 transition-colors hover:text-indigo-400"
          >
            Entrar
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </CardContent>
        </Card>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}
