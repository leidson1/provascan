"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conviteToken = searchParams.get("convite");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const acceptInvitePath = buildInvitePath("/aceitar-convite", conviteToken);
  const forgotPasswordPath = buildInvitePath("/recuperar-senha", conviteToken);
  const signUpPath = buildInvitePath("/signup", conviteToken);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const msg =
        error.message === "Invalid login credentials"
          ? "Email ou senha incorretos. Verifique e tente novamente."
          : error.message;
      toast.error("Erro ao entrar", {
        description: msg,
      });
      setLoading(false);
      return;
    }

    toast.success(
      conviteToken
        ? "Login realizado. Vamos concluir seu convite."
        : "Login realizado com sucesso!",
    );
    router.push(conviteToken ? acceptInvitePath : "/dashboard");
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-2 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <ScanLine className="h-8 w-8 text-indigo-500" />
          <span className="text-2xl font-bold tracking-tight">ProvaScan</span>
        </div>
        <CardTitle className="text-xl">Bem-vindo de volta</CardTitle>
        <CardDescription>Entre na sua conta para continuar</CardDescription>
      </CardHeader>

      {conviteToken && (
        <div className="mx-6 mb-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <UserPlus className="h-4 w-4 shrink-0 text-blue-500" />
          <p className="text-xs text-blue-700">
            Este link tambem funciona para quem ja tem conta. Entre para aceitar
            o convite da equipe.
          </p>
        </div>
      )}

      <form onSubmit={handleEmailLogin}>
        <CardContent className="space-y-4">
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
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">Senha</Label>
              <Link
                href={forgotPasswordPath}
                className="text-xs font-medium text-indigo-500 transition-colors hover:text-indigo-400"
              >
                Esqueci minha senha
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Entrando..." : "Entrar"}
          </Button>

        </CardContent>
      </form>

      <CardFooter className="flex-col gap-2 pt-0">
        <p className="text-sm text-muted-foreground">
          Nao tem conta?{" "}
          <Link
            href={signUpPath}
            className="font-medium text-indigo-500 transition-colors hover:text-indigo-400"
          >
            Cadastre-se
          </Link>
        </p>
        <div className="rounded-md bg-blue-50 px-3 py-1.5 text-center">
          <p className="text-[11px] text-blue-700">
            Ja usa o <strong>SalaMap</strong>? Use o mesmo login e senha aqui!
          </p>
        </div>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
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
      <LoginForm />
    </Suspense>
  );
}
