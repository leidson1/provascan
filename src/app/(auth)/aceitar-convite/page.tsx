"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

function buildInvitePath(basePath: string, conviteToken: string | null) {
  if (!conviteToken) return basePath;

  const params = new URLSearchParams({ convite: conviteToken });
  return `${basePath}?${params.toString()}`;
}

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conviteToken = searchParams.get("convite");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!conviteToken) {
      toast.error("Convite invalido");
      router.replace("/dashboard");
      return;
    }

    const supabase = createClient();

    async function acceptInvite() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Faca login para aceitar o convite");
        router.replace(buildInvitePath("/login", conviteToken));
        return;
      }

      const res = await fetch("/api/aceitar-convite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: conviteToken }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error("Nao foi possivel aceitar o convite", {
          description: data?.error || "Tente novamente em instantes.",
        });
        router.replace("/dashboard");
        return;
      }

      toast.success("Convite aceito com sucesso!");
      router.replace("/dashboard");
    }

    acceptInvite().catch((error) => {
      console.error("Erro ao aceitar convite:", error);
      toast.error("Nao foi possivel aceitar o convite");
      router.replace("/dashboard");
    });
  }, [conviteToken, router]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-2 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <UserPlus className="h-8 w-8 text-indigo-500" />
          <span className="text-2xl font-bold tracking-tight">ProvaScan</span>
        </div>
        <CardTitle className="text-xl">Aceitando convite</CardTitle>
        <CardDescription>
          Estamos vinculando sua conta a equipe.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </CardContent>
    </Card>
  );
}

export default function AcceptInvitePage() {
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
      <AcceptInviteContent />
    </Suspense>
  );
}
