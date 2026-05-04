"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, LockKeyhole, ScanLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function buildInvitePath(basePath: string, conviteToken: string | null) {
  if (!conviteToken) return basePath;

  const params = new URLSearchParams({ convite: conviteToken });
  return `${basePath}?${params.toString()}`;
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conviteToken = searchParams.get("convite");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function checkUser() {
      const response = await supabase.auth.getUser();
      if (!active) return;

      if (!response.data.user) {
        toast.error("Link invalido ou expirado");
        router.replace(buildInvitePath("/recuperar-senha", conviteToken));
        return;
      }

      setCheckingSession(false);
    }

    checkUser().catch((error) => {
      console.error("Erro ao validar sessao de recuperacao:", error);
      toast.error("Nao foi possivel validar o link de recuperacao");
      router.replace(buildInvitePath("/recuperar-senha", conviteToken));
    });

    return () => {
      active = false;
    };
  }, [conviteToken, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("As senhas nao coincidem");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      toast.error("Nao foi possivel atualizar a senha", {
        description: error.message,
      });
      setLoading(false);
      return;
    }

    toast.success("Senha atualizada com sucesso!");
    router.push(
      conviteToken
        ? buildInvitePath("/aceitar-convite", conviteToken)
        : "/dashboard",
    );
  }

  if (checkingSession) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-2 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <ScanLine className="h-8 w-8 text-indigo-500" />
          <span className="text-2xl font-bold tracking-tight">ProvaScan</span>
        </div>
        <CardTitle className="text-xl">Definir nova senha</CardTitle>
        <CardDescription>
          Escolha uma senha nova para voltar a acessar sua conta.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
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
            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
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

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LockKeyhole className="mr-2 h-4 w-4" />
            )}
            {loading ? "Salvando..." : "Salvar nova senha"}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}

export default function ResetPasswordPage() {
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
      <ResetPasswordForm />
    </Suspense>
  );
}
