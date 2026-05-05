"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Mail, ScanLine, UserPlus } from "lucide-react";
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

function buildInvitePath(basePath: string, conviteToken: string | null) {
  if (!conviteToken) return basePath;

  const params = new URLSearchParams({ convite: conviteToken });
  return `${basePath}?${params.toString()}`;
}

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const conviteToken = searchParams.get("convite");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const loginPath = buildInvitePath("/login", conviteToken);
  const resetPasswordPath = buildInvitePath("/redefinir-senha", conviteToken);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${resetPasswordPath}`,
    });

    if (error) {
      toast.error("Nao foi possivel enviar o link", {
        description: error.message,
      });
      setLoading(false);
      return;
    }

    toast.success("Link enviado!", {
      description: "Confira seu email para redefinir a senha.",
    });
    setLoading(false);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-2 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <ScanLine className="h-8 w-8 text-indigo-500" />
          <span className="text-2xl font-bold tracking-tight">ProvaScan</span>
        </div>
        <CardTitle className="text-xl">Recuperar senha</CardTitle>
        <CardDescription>
          Enviaremos um link para voce escolher uma nova senha.
        </CardDescription>
      </CardHeader>

      {conviteToken && (
        <div className="mx-6 mb-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <UserPlus className="h-4 w-4 shrink-0 text-blue-500" />
          <p className="text-xs text-blue-700">
            Depois de redefinir a senha, vamos concluir o convite da equipe.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
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

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            {loading ? "Enviando..." : "Enviar link de recuperacao"}
          </Button>
        </CardContent>
      </form>

      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Lembrou a senha?{" "}
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

export default function ForgotPasswordPage() {
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
      <ForgotPasswordForm />
    </Suspense>
  );
}
