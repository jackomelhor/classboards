import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { PLAN_DEFINITIONS, type PlanCode } from "@/lib/plans";
import type { Workspace, WorkspacePlan, WorkspaceMember } from "@/lib/types";

async function getAuthenticatedUser(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: "Token ausente.", user: null } as const;
  }

  const client = createServiceRoleClient();
  const response = await client.auth.getUser(token);

  if (response.error || !response.data.user) {
    return { error: "Sessão inválida.", user: null } as const;
  }

  return { error: null, user: response.data.user } as const;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error ?? "Sessão inválida." }, { status: 401 });
    }

    const body = (await request.json()) as { inviteCode?: string };
    if (!body.inviteCode) {
      return NextResponse.json({ error: "Código do convite ausente." }, { status: 400 });
    }

    const client = createServiceRoleClient();
    const workspaceRes = await client
      .from("workspaces")
      .select("*")
      .eq("invite_code", body.inviteCode)
      .single();

    if (workspaceRes.error || !workspaceRes.data) {
      return NextResponse.json({ error: "Convite não encontrado." }, { status: 404 });
    }

    const workspace = workspaceRes.data as Workspace;
    const planRes = await client.from("workspace_plans").select("*").eq("workspace_id", workspace.id).maybeSingle();
    if (planRes.error) throw planRes.error;

    const plan = planRes.data as WorkspacePlan | null;
    if (!plan || plan.status !== "active") {
      return NextResponse.json({ error: "Este espaço ainda não está liberado." }, { status: 403 });
    }

    const planDef = PLAN_DEFINITIONS[plan.plan_code as PlanCode];
    if (!planDef.features.sharedWorkspace || planDef.limits.maxMembers <= 1) {
      return NextResponse.json({ error: "Este plano não permite membros extras." }, { status: 403 });
    }

    const membersRes = await client.from("workspace_members").select("*").eq("workspace_id", workspace.id);
    if (membersRes.error) throw membersRes.error;

    const members = (membersRes.data ?? []) as WorkspaceMember[];
    const alreadyMember = members.some((member) => member.user_id === auth.user!.id);
    if (!alreadyMember && members.length >= planDef.limits.maxMembers) {
      return NextResponse.json({ error: "Limite de membros atingido para este plano." }, { status: 403 });
    }

    if (!alreadyMember) {
      const insert = await client.from("workspace_members").insert({
        workspace_id: workspace.id,
        user_id: auth.user.id,
        role: "member",
      });
      if (insert.error) throw insert.error;
    }

    return NextResponse.json({ message: "Entrada confirmada.", workspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível entrar no workspace.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
