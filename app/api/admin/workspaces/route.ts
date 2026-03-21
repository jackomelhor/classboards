import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient, getAdminEmails } from "@/lib/supabase/server";
import type { AdminWorkspaceRow, UserProfile, Workspace, WorkspacePlan, WorkspaceMember } from "@/lib/types";
import type { PlanCode, PlanStatus } from "@/lib/plans";

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

function isAdmin(email: string | null | undefined) {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.error || !isAdmin(auth.user?.email)) {
      return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    }

    const client = createServiceRoleClient();

    const [workspacesRes, profilesRes, membersRes, plansRes] = await Promise.all([
      client.from("workspaces").select("*").order("created_at", { ascending: false }),
      client.from("user_profiles").select("*"),
      client.from("workspace_members").select("*"),
      client.from("workspace_plans").select("*").order("updated_at", { ascending: false }),
    ]);

    if (workspacesRes.error) throw workspacesRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (membersRes.error) throw membersRes.error;
    if (plansRes.error) throw plansRes.error;

    const profiles = (profilesRes.data ?? []) as UserProfile[];
    const members = (membersRes.data ?? []) as WorkspaceMember[];
    const plans = (plansRes.data ?? []) as WorkspacePlan[];
    const profileMap = new Map(profiles.map((profile) => [profile.user_id, profile]));
    const plansMap = new Map(plans.map((plan) => [plan.workspace_id, plan]));

    const rows: AdminWorkspaceRow[] = ((workspacesRes.data ?? []) as Workspace[]).map((workspace) => ({
      workspace,
      ownerProfile: profileMap.get(workspace.owner_id) ?? null,
      plan: plansMap.get(workspace.id) ?? null,
      memberCount: members.filter((member) => member.workspace_id === workspace.id).length,
    }));

    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no painel admin.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.error || !isAdmin(auth.user?.email)) {
      return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    }

    const body = (await request.json()) as {
      workspaceId?: string;
      planCode?: PlanCode;
      status?: PlanStatus;
      notes?: string;
    };

    if (!body.workspaceId || !body.planCode || !body.status) {
      return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
    }

    const client = createServiceRoleClient();
    const now = new Date().toISOString();

    const updatePlan = await client
      .from("workspace_plans")
      .upsert(
        {
          workspace_id: body.workspaceId,
          plan_code: body.planCode,
          status: body.status,
          notes: body.notes?.trim() || null,
          granted_by: auth.user!.id,
          activated_at: body.status === "active" ? now : null,
        },
        { onConflict: "workspace_id" }
      )
      .select("*")
      .single();

    if (updatePlan.error) throw updatePlan.error;

    const workspaceType = body.planCode === "individual_free" ? "individual" : body.planCode;
    const updateWorkspace = await client
      .from("workspaces")
      .update({ workspace_type: workspaceType })
      .eq("id", body.workspaceId)
      .select("*")
      .single();

    if (updateWorkspace.error) throw updateWorkspace.error;

    return NextResponse.json({
      message: "Plano atualizado.",
      plan: updatePlan.data,
      workspace: updateWorkspace.data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar plano.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
