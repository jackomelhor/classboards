"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, Users } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { Workspace } from "@/lib/types";

export default function JoinWorkspacePage() {
  const params = useParams<{ inviteCode: string }>();
  const inviteCode = params.inviteCode;
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteCode) return;
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    void (async () => {
      const query = await supabase.from("workspaces").select("*").eq("invite_code", inviteCode).single();
      if (query.error) {
        setErrorMessage("Convite não encontrado.");
      } else {
        setWorkspace(query.data as Workspace);
      }
      setLoading(false);
    })();
  }, [inviteCode]);

  async function handleJoin() {
    if (!supabase || !workspace) return;

    setJoining(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Faça login no aplicativo principal antes de entrar neste espaço.");
      }

      const response = await fetch("/api/workspaces/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ inviteCode }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível entrar no espaço.");
      }

      setMessage(payload.message ?? "Entrada confirmada. Agora volte ao app.");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível entrar no espaço.";
      setErrorMessage(nextMessage);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-xl rounded-[32px] bg-white p-8 shadow-panel">
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-[24px] bg-brand-600 text-white">
          <Users className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Entrar no espaço</h1>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Código</p>
          <p className="mt-1 font-semibold text-slate-900">{inviteCode || "..."}</p>
        </div>

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-4 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando convite...
            </div>
          ) : workspace ? (
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Workspace</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{workspace.name}</p>
              <p className="mt-1 text-slate-600">{workspace.school_name || "Sem escola"}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorMessage ?? "Convite inválido."}
            </div>
          )}

          {message ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> {message}
            </div>
          ) : null}

          {errorMessage && workspace ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <button
            type="button"
            disabled={!workspace || joining}
            onClick={() => void handleJoin()}
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-brand-600 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {joining ? "Entrando..." : "Entrar no espaço"}
          </button>

          <Link
            href="/"
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-slate-200 font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Voltar para o app
          </Link>
        </div>
      </div>
    </div>
  );
}
