"use client";

export const dynamic = 'force-dynamic'

import { useState } from "react";
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
import { ScanLine } from "lucide-react";

export default function SignUpPage() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (!acceptedTerms) {
      toast.error("Você precisa aceitar os Termos de Uso");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome,
        },
      },
    });

    if (error) {
      toast.error("Erro ao criar conta", {
        description: error.message,
      });
      setLoading(false);
      return;
    }

    toast.success("Conta criada com sucesso!", {
      description: "Verifique seu email para confirmar o cadastro.",
    });
    setLoading(false);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-2">
          <ScanLine className="h-8 w-8 text-indigo-500" />
          <span className="text-2xl font-bold tracking-tight">ProvaScan</span>
        </div>
        <CardTitle className="text-xl">Criar conta</CardTitle>
        <CardDescription>
          Preencha os dados abaixo para se cadastrar
        </CardDescription>
      </CardHeader>

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
              placeholder="••••••••"
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
              placeholder="••••••••"
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
                className="font-medium text-indigo-500 hover:text-indigo-400 transition-colors underline"
                target="_blank"
              >
                Termos de Uso e Política de Privacidade
              </Link>
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando conta..." : "Criar Conta"}
          </Button>
        </CardContent>
      </form>

      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link
            href="/login"
            className="font-medium text-indigo-500 hover:text-indigo-400 transition-colors"
          >
            Entrar
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
