"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  AlertCircle,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  Crown,
  Home,
  Instagram,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  Mail,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  Shield,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { PLAN_DEFINITIONS, PLAN_ORDER, getPlanDefinition, type PlanCode, type PlanStatus } from "@/lib/plans";
import type {
  AdminWorkspaceRow,
  ChecklistItem,
  Priority,
  Task,
  TaskFormValues,
  TaskStatus,
  UserProfile,
  Workspace,
  WorkspaceGroup,
  WorkspaceMember,
  WorkspacePlan,
  WorkspaceType,
} from "@/lib/types";
import { TaskForm } from "@/components/task-form";

type Screen = "plans" | "dashboard" | "tasks" | "calendar" | "workspace" | "admin";
type AuthMode = "signin" | "signup";

type WorkspaceMembershipQuery = {
  workspace_id: string;
  role: string;
  workspaces: Workspace | Workspace[] | null;
};

type WorkspaceFormValues = {
  schoolName: string;
  className: string;
};

type GroupFormValues = {
  name: string;
  description: string;
};

const INSTAGRAM_URL = "https://www.instagram.com/vt._rodrxgs/";

const emptyWorkspaceForm: WorkspaceFormValues = {
  schoolName: "",
  className: "",
};

const emptyGroupForm: GroupFormValues = {
  name: "",
  description: "",
};

function createLocalSession(name: string): Session {
  return {
    access_token: "local-access-token",
    refresh_token: "local-refresh-token",
    expires_in: 60 * 60 * 24,
    token_type: "bearer",
    user: {
      id: "local-user",
      aud: "authenticated",
      app_metadata: {},
      user_metadata: { full_name: name || "Usuário" },
      created_at: new Date().toISOString(),
      email: "local@demo.app",
    },
  } as unknown as Session;
}

function startOfWeek(base = new Date()) {
  const date = new Date(base);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function diffInDays(dateString: string) {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(`${dateString}T00:00:00`).getTime();
  return Math.round((target - current) / (1000 * 60 * 60 * 24));
}

function formatDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function humanDueLabel(dateString: string) {
  const days = diffInDays(dateString);
  if (days < 0) return `Atrasada há ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}`;
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanhã";
  return `Em ${days} dias`;
}

function mapPriority(priority: Priority) {
  if (priority === "alta") return "bg-red-50 text-red-700 border-red-200";
  if (priority === "media") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function mapUrgency(dateString: string) {
  const days = diffInDays(dateString);
  if (days <= 1) return "bg-red-50 text-red-700 border-red-200";
  if (days <= 3) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function statusLabel(status: TaskStatus) {
  const labels: Record<TaskStatus, string> = {
    pendente: "Pendente",
    em_andamento: "Em andamento",
    concluida: "Concluída",
  };
  return labels[status];
}

function calculateProgress(items: ChecklistItem[]) {
  if (!items.length) return 0;
  const done = items.filter((item) => item.is_done).length;
  return Math.round((done / items.length) * 100);
}

function workspaceToFormValues(workspace: Workspace): WorkspaceFormValues {
  return {
    schoolName: workspace.school_name ?? "",
    className: workspace.name,
  };
}

function taskToFormValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? "",
    subject: task.subject,
    taskType: task.task_type,
    dueDate: task.due_date,
    priority: task.priority,
    status: task.status,
    checklistRaw: task.checklist_items.map((item) => item.content).join("\n"),
    groupId: task.group_id ?? "",
    file: null,
  };
}

function normalizePlan(workspace: Workspace | null, plan: WorkspacePlan | null): WorkspacePlan | null {
  if (plan) return plan;
  if (!workspace) return null;

  if (workspace.workspace_type === "individual") {
    return {
      id: `local-${workspace.id}`,
      workspace_id: workspace.id,
      plan_code: "individual_free",
      status: "active",
      notes: null,
      granted_by: null,
    };
  }

  return null;
}

async function uploadAttachment(file: File, userId: string) {
  const client = supabase;
  if (!client) {
    return { attachment_name: null, attachment_url: null };
  }

  const safeName = file.name.replace(/\s+/g, "-");
  const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await client.storage.from("task-files").upload(path, file, { upsert: false });
  if (error) throw error;

  const { data } = client.storage.from("task-files").getPublicUrl(path);
  return {
    attachment_name: file.name,
    attachment_url: data.publicUrl,
  };
}

function useNotificationPermission() {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    setNotificationPermission(
      typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
    );
  }, []);

  return { notificationPermission, setNotificationPermission };
}

export function ClassBoardApp() {
  const localMode = !isSupabaseConfigured || !supabase;

  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [screen, setScreen] = useState<Screen>("workspace");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [selectedPlanCode, setSelectedPlanCode] = useState<PlanCode>("individual_free");
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceFormValues>(emptyWorkspaceForm);
  const [groupForm, setGroupForm] = useState<GroupFormValues>(emptyGroupForm);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspacePlan, setWorkspacePlan] = useState<WorkspacePlan | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskFormMode, setTaskFormMode] = useState<"create" | "edit">("create");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskFilter, setTaskFilter] = useState<"todos" | "proximas" | "provas" | "concluidas">("todos");
  const [search, setSearch] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [submittingAuth, setSubmittingAuth] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRows, setAdminRows] = useState<AdminWorkspaceRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSavingWorkspaceId, setAdminSavingWorkspaceId] = useState<string | null>(null);
  const [adminSearch, setAdminSearch] = useState("");

  const { notificationPermission, setNotificationPermission } = useNotificationPermission();

  useEffect(() => {
    if (localMode || !supabase) {
      setLoadingAuth(false);
      return;
    }

    const client = supabase;

    void client.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoadingAuth(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession ?? null);
      setLoadingAuth(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [localMode]);

  useEffect(() => {
    if (!session?.user) {
      setWorkspace(null);
      setWorkspacePlan(null);
      setTasks([]);
      setGroups([]);
      setMembers([]);
      setIsAdmin(false);
      setAdminRows([]);
      return;
    }

    void bootstrapWorkspace(session.user);
    if (!localMode) {
      void loadAdminRows();
    }
  }, [localMode, session?.user?.id]);

  useEffect(() => {
    if (notificationPermission !== "granted" || !tasks.length) return;

    const cacheKey = `classboard-notified-${new Date().toISOString().slice(0, 10)}`;
    const notified = typeof window !== "undefined" ? window.sessionStorage.getItem(cacheKey) : null;
    if (notified) return;

    const dueSoon = tasks.filter((task) => {
      const diff = diffInDays(task.due_date);
      return (diff === 3 || diff === 1 || diff === 0) && task.status !== "concluida";
    });

    if (!dueSoon.length) return;

    const task = dueSoon[0];
    new Notification("ClassBoard", {
      body: `${task.title} • ${humanDueLabel(task.due_date)}`,
    });

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(cacheKey, "1");
    }
  }, [notificationPermission, tasks]);

  const activePlan = normalizePlan(workspace, workspacePlan);
  const planDefinition = getPlanDefinition(activePlan?.plan_code ?? selectedPlanCode);
  const accessGranted = Boolean(activePlan && activePlan.status === "active");
  const activeTaskCount = useMemo(() => tasks.filter((task) => task.status !== "concluida").length, [tasks]);
  const canUseGroups = Boolean(accessGranted && planDefinition?.features.groups);
  const canUseAttachments = Boolean(accessGranted && planDefinition?.features.attachments);
  const canInviteMembers = Boolean(accessGranted && planDefinition?.limits.maxMembers && planDefinition.limits.maxMembers > 1);
  const taskLimitReached = Boolean(planDefinition && activeTaskCount >= planDefinition.limits.maxActiveTasks);

  const todayTasks = useMemo(() => tasks.filter((task) => diffInDays(task.due_date) === 0), [tasks]);
  const upcomingTests = useMemo(
    () => tasks.filter((task) => task.task_type === "prova" && task.status !== "concluida").slice(0, 3),
    [tasks]
  );
  const pendingTasks = useMemo(
    () => tasks.filter((task) => task.task_type !== "prova" && task.status !== "concluida").slice(0, 3),
    [tasks]
  );
  const doneCount = useMemo(() => tasks.filter((task) => task.status === "concluida").length, [tasks]);
  const pendingCount = useMemo(() => tasks.filter((task) => task.status !== "concluida").length, [tasks]);

  const weeklyCalendar = useMemo(() => {
    const weekStart = startOfWeek();
    return Array.from({ length: 5 }).map((_, index) => {
      const current = new Date(weekStart);
      current.setDate(weekStart.getDate() + index);
      const iso = current.toISOString().slice(0, 10);
      const items = tasks.filter((task) => task.due_date === iso);
      const dayLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(current).replace(".", "");
      return { iso, dayLabel, items };
    });
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch = `${task.title} ${task.subject}`.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (taskFilter === "proximas") return diffInDays(task.due_date) <= 3;
      if (taskFilter === "provas") return task.task_type === "prova";
      if (taskFilter === "concluidas") return task.status === "concluida";
      return true;
    });
  }, [search, taskFilter, tasks]);

  const filteredAdminRows = useMemo(() => {
    const term = adminSearch.trim().toLowerCase();
    if (!term) return adminRows;
    return adminRows.filter((row) => {
      const owner = row.ownerProfile?.email ?? "";
      const ownerName = row.ownerProfile?.full_name ?? "";
      const workspaceName = row.workspace.name;
      const school = row.workspace.school_name ?? "";
      return `${owner} ${ownerName} ${workspaceName} ${school}`.toLowerCase().includes(term);
    });
  }, [adminRows, adminSearch]);

  async function bootstrapWorkspace(user: User) {
    if (localMode) {
      setScreen("workspace");
      return;
    }

    const client = supabase;
    if (!client) return;

    setLoadingData(true);
    setErrorMessage(null);

    try {
      const membershipQuery = await client
        .from("workspace_members")
        .select("workspace_id, role, workspaces(*)")
        .eq("user_id", user.id)
        .limit(1);

      if (membershipQuery.error) throw membershipQuery.error;

      const row = membershipQuery.data?.[0] as WorkspaceMembershipQuery | undefined;
      if (!row) {
        setWorkspace(null);
        setWorkspacePlan(null);
        setTasks([]);
        setGroups([]);
        setMembers([]);
        setWorkspaceForm(emptyWorkspaceForm);
        setSelectedPlanCode("individual_free");
        setScreen("workspace");
        return;
      }

      const currentWorkspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
      if (!currentWorkspace) {
        setScreen("workspace");
        return;
      }

      setWorkspace(currentWorkspace);
      setWorkspaceForm(workspaceToFormValues(currentWorkspace));

      const [planResponse] = await Promise.all([
        client.from("workspace_plans").select("*").eq("workspace_id", currentWorkspace.id).maybeSingle(),
        loadTasks(currentWorkspace.id),
        loadGroups(currentWorkspace.id),
        loadMembers(currentWorkspace.id),
      ]);

      if (planResponse.error) throw planResponse.error;
      const nextPlan = normalizePlan(currentWorkspace, (planResponse.data as WorkspacePlan | null) ?? null);
      setWorkspacePlan(nextPlan);
      if (nextPlan) {
        setSelectedPlanCode(nextPlan.plan_code);
      }

      setScreen(nextPlan?.status === "active" ? "dashboard" : "workspace");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível carregar os dados.";
      setErrorMessage(nextMessage);
    } finally {
      setLoadingData(false);
    }
  }

  async function loadTasks(workspaceId: string) {
    const client = supabase;
    if (!client) return;

    const query = await client
      .from("tasks")
      .select("*, checklist_items(*)")
      .eq("workspace_id", workspaceId)
      .order("due_date", { ascending: true });

    if (query.error) throw query.error;

    const records = (query.data ?? []) as Task[];
    setTasks(
      records.map((task) => ({
        ...task,
        checklist_items: [...(task.checklist_items ?? [])].sort((a, b) =>
          (a.created_at ?? "").localeCompare(b.created_at ?? "")
        ),
      }))
    );
  }

  async function loadGroups(workspaceId: string) {
    const client = supabase;
    if (!client) return;
    const response = await client.from("workspace_groups").select("*").eq("workspace_id", workspaceId).order("name");
    if (response.error) throw response.error;
    setGroups((response.data ?? []) as WorkspaceGroup[]);
  }

  async function loadMembers(workspaceId: string) {
    const client = supabase;
    if (!client) return;

    const membersRes = await client.from("workspace_members").select("*").eq("workspace_id", workspaceId).order("created_at");
    if (membersRes.error) throw membersRes.error;
    const membershipRows = (membersRes.data ?? []) as WorkspaceMember[];

    const userIds = membershipRows.map((member) => member.user_id);
    if (!userIds.length) {
      setMembers([]);
      return;
    }

    const profilesRes = await client.from("user_profiles").select("*").in("user_id", userIds);
    if (profilesRes.error) throw profilesRes.error;

    const profiles = new Map(((profilesRes.data ?? []) as UserProfile[]).map((profile) => [profile.user_id, profile]));
    setMembers(
      membershipRows.map((member) => ({
        ...member,
        profile: profiles.get(member.user_id) ?? null,
      }))
    );
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingAuth(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      if (localMode) {
        setSession(createLocalSession(fullName));
        return;
      }

      const client = supabase;
      if (!client) {
        throw new Error("Supabase não configurado.");
      }

      if (authMode === "signup") {
        const existsResponse = await client.rpc("email_exists", { candidate_email: email.trim().toLowerCase() });
        if (existsResponse.error) throw existsResponse.error;
        if (existsResponse.data) {
          throw new Error("Este email já tem conta. Faça login para continuar.");
        }

        const response = await client.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (response.error) {
          if (response.error.message.toLowerCase().includes("already registered")) {
            throw new Error("Este email já tem conta. Faça login para continuar.");
          }
          throw response.error;
        }

        if (response.data.session) {
          setSession(response.data.session);
        } else {
          setMessage("Conta criada. Faça login para continuar.");
          setAuthMode("signin");
        }
      } else {
        const response = await client.auth.signInWithPassword({ email, password });
        if (response.error) throw response.error;
      }
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível autenticar.";
      setErrorMessage(nextMessage);
    } finally {
      setSubmittingAuth(false);
    }
  }

  async function handleSignOut() {
    setMessage(null);
    setErrorMessage(null);
    setMobileMenuOpen(false);

    if (localMode) {
      setSession(null);
      setWorkspace(null);
      setWorkspacePlan(null);
      setTasks([]);
      setGroups([]);
      setMembers([]);
      setWorkspaceForm(emptyWorkspaceForm);
      setScreen("workspace");
      return;
    }

    const client = supabase;
    if (!client) {
      setErrorMessage("Supabase não configurado.");
      return;
    }

    await client.auth.signOut();
    setSession(null);
    setWorkspace(null);
    setWorkspacePlan(null);
    setTasks([]);
    setGroups([]);
    setMembers([]);
    setWorkspaceForm(emptyWorkspaceForm);
    setScreen("workspace");
  }

  async function handleSaveWorkspace(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSavingWorkspace(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const freePlan = PLAN_DEFINITIONS.individual_free;
      const currentActivePlan = getPlanDefinition(activePlan?.plan_code ?? "individual_free") ?? freePlan;
      const payload = {
        school_name: workspaceForm.schoolName.trim() || null,
        name: workspaceForm.className.trim(),
        workspace_type: (workspace ? currentActivePlan.workspaceType : freePlan.workspaceType) as WorkspaceType,
      };

      if (!payload.name) {
        throw new Error("Informe o nome do espaço.");
      }

      if (localMode) {
        const ownerId = session?.user?.id ?? "local-user";
        const nextWorkspace: Workspace = {
          id: workspace?.id ?? crypto.randomUUID(),
          owner_id: ownerId,
          invite_code: workspace?.invite_code ?? Math.random().toString(36).slice(2, 10).toUpperCase(),
          ...payload,
        };
        const nextPlan: WorkspacePlan = workspacePlan ?? {
          id: crypto.randomUUID(),
          workspace_id: nextWorkspace.id,
          plan_code: "individual_free",
          status: "active",
          notes: "Plano gratuito liberado automaticamente.",
          granted_by: null,
        };
        setWorkspace(nextWorkspace);
        setWorkspacePlan(nextPlan);
        setSelectedPlanCode(nextPlan.plan_code);
        setMembers([
          {
            id: crypto.randomUUID(),
            workspace_id: nextWorkspace.id,
            user_id: ownerId,
            role: "owner",
            profile: {
              user_id: ownerId,
              full_name: fullName || "Usuário",
              email: "local@demo.app",
            },
          },
        ]);
        setScreen("dashboard");
        setMessage(workspace ? "Configurações atualizadas." : "Espaço criado com plano gratuito ativo.");
        return;
      }

      const client = supabase;
      const currentUserId = session?.user?.id;
      if (!currentUserId || !client) throw new Error("Sessão não encontrada.");

      if (!workspace) {
        const insertedWorkspace = await client
          .from("workspaces")
          .insert({ owner_id: currentUserId, ...payload })
          .select("*")
          .single();
        if (insertedWorkspace.error) throw insertedWorkspace.error;

        const insertedMembership = await client.from("workspace_members").insert({
          workspace_id: insertedWorkspace.data.id,
          user_id: currentUserId,
          role: "owner",
        });
        if (insertedMembership.error) throw insertedMembership.error;

        const insertedPlan = await client
          .from("workspace_plans")
          .upsert(
            {
              workspace_id: insertedWorkspace.data.id,
              plan_code: "individual_free",
              status: "active",
              notes: "Plano gratuito liberado automaticamente.",
              activated_at: new Date().toISOString(),
            },
            { onConflict: "workspace_id" }
          )
          .select("*")
          .single();
        if (insertedPlan.error) throw insertedPlan.error;

        setWorkspace(insertedWorkspace.data as Workspace);
        setWorkspacePlan(insertedPlan.data as WorkspacePlan);
        setSelectedPlanCode("individual_free");
        setWorkspaceForm(workspaceToFormValues(insertedWorkspace.data as Workspace));
        await loadMembers(insertedWorkspace.data.id);
      } else {
        const updatedWorkspace = await client
          .from("workspaces")
          .update(payload)
          .eq("id", workspace.id)
          .select("*")
          .single();
        if (updatedWorkspace.error) throw updatedWorkspace.error;

        if (!workspacePlan) {
          const ensuredPlan = await client
            .from("workspace_plans")
            .upsert(
              {
                workspace_id: workspace.id,
                plan_code: "individual_free",
                status: "active",
                notes: "Plano gratuito liberado automaticamente.",
                activated_at: new Date().toISOString(),
              },
              { onConflict: "workspace_id" }
            )
            .select("*")
            .single();
          if (ensuredPlan.error) throw ensuredPlan.error;
          setWorkspacePlan(ensuredPlan.data as WorkspacePlan);
          setSelectedPlanCode("individual_free");
        }

        setWorkspace(updatedWorkspace.data as Workspace);
        setWorkspaceForm(workspaceToFormValues(updatedWorkspace.data as Workspace));
      }

      setScreen("dashboard");
      setMessage(workspace ? "Configurações atualizadas." : "Espaço criado com plano gratuito ativo.");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível salvar o espaço.";
      setErrorMessage(nextMessage);
    } finally {
      setSavingWorkspace(false);
    }
  }

  function openCreateTask() {
    if (!accessGranted) {
      setErrorMessage("Seu plano ainda não está ativo.");
      return;
    }
    if (taskLimitReached) {
      setErrorMessage("Você atingiu o limite de tarefas do seu plano atual.");
      return;
    }
    setTaskFormMode("create");
    setSelectedTask(null);
    setShowTaskForm(true);
  }

  function openEditTask(task: Task) {
    setTaskFormMode("edit");
    setSelectedTask(task);
    setShowTaskForm(true);
  }

  async function handleTaskSubmit(values: TaskFormValues) {
    if (!workspace) return;

    setSavingTask(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      if (!accessGranted) {
        throw new Error("Plano ainda não ativo.");
      }

      if (!canUseAttachments && values.file) {
        throw new Error("Seu plano atual não permite anexos.");
      }

      if (!canUseGroups && values.groupId) {
        throw new Error("Seu plano atual não permite grupos.");
      }

      if (taskFormMode === "create" && taskLimitReached) {
        throw new Error("Você atingiu o limite de tarefas do seu plano atual.");
      }

      const attachment =
        values.file && session?.user?.id && !localMode ? await uploadAttachment(values.file, session.user.id) : null;
      const checklistLines = values.checklistRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (taskFormMode === "create") {
        if (localMode || !supabase || !session?.user) {
          const newTaskId = crypto.randomUUID();
          const newTask: Task = {
            id: newTaskId,
            workspace_id: workspace.id,
            author_id: session?.user?.id ?? "local-user",
            title: values.title,
            description: values.description || null,
            subject: values.subject,
            task_type: values.taskType,
            due_date: values.dueDate,
            priority: values.priority,
            status: values.status,
            attachment_name: values.file?.name ?? null,
            attachment_url: null,
            group_id: values.groupId || null,
            checklist_items: checklistLines.map((content) => ({
              id: crypto.randomUUID(),
              task_id: newTaskId,
              content,
              is_done: false,
            })),
          };
          setTasks((prev) => [...prev, newTask].sort((a, b) => a.due_date.localeCompare(b.due_date)));
        } else {
          const client = supabase;
          const insertedTask = await client
            .from("tasks")
            .insert({
              workspace_id: workspace.id,
              author_id: session.user.id,
              title: values.title,
              description: values.description || null,
              subject: values.subject,
              task_type: values.taskType,
              due_date: values.dueDate,
              priority: values.priority,
              status: values.status,
              attachment_name: attachment?.attachment_name ?? null,
              attachment_url: attachment?.attachment_url ?? null,
              group_id: values.groupId || null,
            })
            .select("*")
            .single();
          if (insertedTask.error) throw insertedTask.error;

          if (checklistLines.length) {
            const insertChecklist = await client.from("checklist_items").insert(
              checklistLines.map((content) => ({
                task_id: insertedTask.data.id,
                content,
                is_done: false,
              }))
            );
            if (insertChecklist.error) throw insertChecklist.error;
          }

          await loadTasks(workspace.id);
        }
      } else if (selectedTask) {
        if (localMode || !supabase || !session?.user) {
          setTasks((prev) =>
            prev
              .map((task) =>
                task.id === selectedTask.id
                  ? {
                      ...task,
                      title: values.title,
                      description: values.description || null,
                      subject: values.subject,
                      task_type: values.taskType,
                      due_date: values.dueDate,
                      priority: values.priority,
                      status: values.status,
                      attachment_name: values.file?.name ?? task.attachment_name,
                      group_id: values.groupId || null,
                      checklist_items: checklistLines.map((content, index) => ({
                        id: task.checklist_items[index]?.id ?? crypto.randomUUID(),
                        task_id: task.id,
                        content,
                        is_done: task.checklist_items[index]?.is_done ?? false,
                      })),
                    }
                  : task
              )
              .sort((a, b) => a.due_date.localeCompare(b.due_date))
          );
        } else {
          const client = supabase;
          const updateTask = await client
            .from("tasks")
            .update({
              title: values.title,
              description: values.description || null,
              subject: values.subject,
              task_type: values.taskType,
              due_date: values.dueDate,
              priority: values.priority,
              status: values.status,
              attachment_name: attachment?.attachment_name ?? selectedTask.attachment_name,
              attachment_url: attachment?.attachment_url ?? selectedTask.attachment_url,
              group_id: values.groupId || null,
            })
            .eq("id", selectedTask.id);
          if (updateTask.error) throw updateTask.error;

          const deleteChecklist = await client.from("checklist_items").delete().eq("task_id", selectedTask.id);
          if (deleteChecklist.error) throw deleteChecklist.error;

          if (checklistLines.length) {
            const insertChecklist = await client.from("checklist_items").insert(
              checklistLines.map((content) => ({
                task_id: selectedTask.id,
                content,
                is_done: false,
              }))
            );
            if (insertChecklist.error) throw insertChecklist.error;
          }

          await loadTasks(workspace.id);
        }
      }

      setShowTaskForm(false);
      setSelectedTask(null);
      setMessage(taskFormMode === "create" ? "Tarefa criada." : "Tarefa atualizada.");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível salvar a tarefa.";
      setErrorMessage(nextMessage);
    } finally {
      setSavingTask(false);
    }
  }

  async function handleDeleteTask() {
    if (!selectedTask) return;
    setDeletingTask(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      if (localMode || !supabase) {
        setTasks((prev) => prev.filter((task) => task.id !== selectedTask.id));
      } else {
        const client = supabase;
        const deleteTask = await client.from("tasks").delete().eq("id", selectedTask.id);
        if (deleteTask.error) throw deleteTask.error;
        if (workspace) {
          await loadTasks(workspace.id);
        }
      }
      setShowTaskForm(false);
      setSelectedTask(null);
      setMessage("Tarefa excluída.");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível excluir a tarefa.";
      setErrorMessage(nextMessage);
    } finally {
      setDeletingTask(false);
    }
  }

  async function toggleChecklist(task: Task, item: ChecklistItem) {
    try {
      const updatedItems = task.checklist_items.map((current) =>
        current.id === item.id ? { ...current, is_done: !current.is_done } : current
      );
      const nextStatus: TaskStatus =
        updatedItems.length > 0 && updatedItems.every((entry) => entry.is_done) ? "concluida" : "em_andamento";

      if (localMode || !supabase) {
        setTasks((prev) =>
          prev.map((currentTask) =>
            currentTask.id === task.id
              ? {
                  ...currentTask,
                  status: nextStatus,
                  checklist_items: updatedItems,
                }
              : currentTask
          )
        );
        return;
      }

      const client = supabase;
      const checklistUpdate = await client.from("checklist_items").update({ is_done: !item.is_done }).eq("id", item.id);
      if (checklistUpdate.error) throw checklistUpdate.error;

      const taskUpdate = await client.from("tasks").update({ status: nextStatus }).eq("id", task.id);
      if (taskUpdate.error) throw taskUpdate.error;

      setTasks((prev) =>
        prev.map((currentTask) =>
          currentTask.id === task.id
            ? {
                ...currentTask,
                status: nextStatus,
                checklist_items: updatedItems,
              }
            : currentTask
        )
      );
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível atualizar o checklist.";
      setErrorMessage(nextMessage);
    }
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingGroup(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      if (!workspace || !planDefinition) {
        throw new Error("Configure o espaço antes de criar grupos.");
      }
      if (!canUseGroups) {
        throw new Error("Seu plano atual não permite grupos.");
      }
      if (groups.length >= planDefinition.limits.maxGroups) {
        throw new Error("Você atingiu o limite de grupos do seu plano.");
      }
      if (!groupForm.name.trim()) {
        throw new Error("Informe o nome do grupo.");
      }

      if (localMode || !supabase || !session?.user) {
        setGroups((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            workspace_id: workspace.id,
            created_by: session?.user?.id ?? "local-user",
            name: groupForm.name.trim(),
            description: groupForm.description.trim() || null,
          },
        ]);
      } else {
        const client = supabase;
        const response = await client.from("workspace_groups").insert({
          workspace_id: workspace.id,
          created_by: session.user.id,
          name: groupForm.name.trim(),
          description: groupForm.description.trim() || null,
        });
        if (response.error) throw response.error;
        await loadGroups(workspace.id);
      }

      setGroupForm(emptyGroupForm);
      setMessage("Grupo criado.");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível criar o grupo.";
      setErrorMessage(nextMessage);
    } finally {
      setSavingGroup(false);
    }
  }

  async function requestNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  async function copyInviteLink() {
    if (!workspace) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const link = `${origin}/join/${workspace.invite_code}`;
    await navigator.clipboard.writeText(link);
    setMessage("Link copiado.");
  }

  async function loadAdminRows() {
    if (localMode || !session?.access_token) {
      setIsAdmin(false);
      return;
    }

    setAdminLoading(true);
    try {
      const response = await fetch("/api/admin/workspaces", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.status === 403) {
        setIsAdmin(false);
        setAdminRows([]);
        return;
      }

      const payload = (await response.json()) as { rows?: AdminWorkspaceRow[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao carregar painel admin.");
      }

      setIsAdmin(true);
      setAdminRows(payload.rows ?? []);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Falha ao carregar painel admin.";
      setErrorMessage(nextMessage);
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleAdminUpdate(row: AdminWorkspaceRow, planCode: PlanCode, status: PlanStatus) {
    if (!session?.access_token) return;
    setAdminSavingWorkspaceId(row.workspace.id);
    setErrorMessage(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/workspaces", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          workspaceId: row.workspace.id,
          planCode,
          status,
          notes: status === "active" ? "Plano liberado manualmente pelo proprietário." : "Plano em análise manual.",
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao atualizar o plano.");
      }

      setMessage("Plano atualizado.");
      await loadAdminRows();
      if (workspace?.id === row.workspace.id) {
        await bootstrapWorkspace(session.user);
      }
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Falha ao atualizar o plano.";
      setErrorMessage(nextMessage);
    } finally {
      setAdminSavingWorkspaceId(null);
    }
  }

  const navItems = [
    { id: "dashboard" as Screen, label: "Painel", icon: <LayoutDashboard className="h-5 w-5" />, hidden: !workspace },
    { id: "tasks" as Screen, label: "Tarefas", icon: <ClipboardList className="h-5 w-5" />, hidden: !workspace },
    { id: "calendar" as Screen, label: "Calendário", icon: <CalendarDays className="h-5 w-5" />, hidden: !workspace },
    { id: "workspace" as Screen, label: "Configuração", icon: <Settings className="h-5 w-5" /> },
    { id: "plans" as Screen, label: "Planos", icon: <Crown className="h-5 w-5" /> },
    { id: "admin" as Screen, label: "Admin", icon: <Shield className="h-5 w-5" />, hidden: !isAdmin },
  ].filter((item) => !item.hidden);

  if (loadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex items-center gap-3 rounded-3xl bg-white px-6 py-5 shadow-panel">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
          <span className="font-medium text-slate-700">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="auth-grid-bg min-h-screen px-4 py-6 text-white md:px-8">
        <div className="mx-auto grid min-h-[92vh] max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.95fr]">
          <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-8">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-950/30">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="mt-8 space-y-6">
              <div>
                <p className="text-sm text-blue-100">ClassBoard</p>
                <h1 className="mt-2 text-4xl font-bold sm:text-5xl">Entrar</h1>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sm text-blue-50">
                  <p className="font-semibold">Organização da rotina</p>
                  <p className="mt-2 text-xs text-blue-100">Centralize tarefas, prazos, provas e apresentações em um painel só.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sm text-blue-50">
                  <p className="font-semibold">Colaboração simples</p>
                  <p className="mt-2 text-xs text-blue-100">Monte seu espaço, acompanhe membros e organize grupos quando o plano permitir.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sm text-blue-50">
                  <p className="font-semibold">Controle total</p>
                  <p className="mt-2 text-xs text-blue-100">Você pode usar o app normalmente e administrar liberações em uma área separada.</p>
                </div>
              </div>

              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15"
              >
                <Instagram className="h-4 w-4" /> Falar com o proprietário @vt._rodrxgs
              </a>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-slate-950/85 p-6 backdrop-blur sm:p-8">
            <div className="mb-6 flex gap-3">
              <button
                type="button"
                onClick={() => setAuthMode("signin")}
                className={`inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-medium transition ${
                  authMode === "signin" ? "bg-white text-slate-900" : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className={`inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-medium transition ${
                  authMode === "signup" ? "bg-brand-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                Criar conta
              </button>
            </div>

            {message && <AlertBanner tone="success" message={message} />}
            {errorMessage && <AlertBanner tone="error" message={errorMessage} />}

            <form className="mt-6 space-y-4" onSubmit={handleAuthSubmit}>
              {authMode === "signup" ? (
                <div className="space-y-2">
                  <label className="text-sm text-slate-300">Nome</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required={authMode === "signup"}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white placeholder:text-slate-500"
                    placeholder="Seu nome"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm text-slate-300">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  type="email"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white placeholder:text-slate-500"
                  placeholder="voce@email.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-slate-300">Senha</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  type="password"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white placeholder:text-slate-500"
                  placeholder="******"
                />
              </div>

              <button
                type="submit"
                disabled={submittingAuth}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-brand-600 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submittingAuth ? "Processando..." : authMode === "signup" ? "Criar conta" : "Entrar"}
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <TaskForm
        open={showTaskForm}
        onClose={() => {
          setShowTaskForm(false);
          setSelectedTask(null);
        }}
        onSubmit={handleTaskSubmit}
        submitting={savingTask}
        initialValues={selectedTask ? taskToFormValues(selectedTask) : null}
        mode={taskFormMode}
        onDelete={taskFormMode === "edit" ? handleDeleteTask : null}
        deleting={deletingTask}
        groups={groups}
        allowGroups={canUseGroups}
        allowAttachments={canUseAttachments}
      />

      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-slate-200 bg-slate-950 px-4 py-6 text-white xl:flex xl:flex-col xl:gap-6">
          <BrandPanel onContact />
          <nav className="space-y-2">
            {navItems.map((item) => (
              <SidebarButton
                key={item.id}
                active={screen === item.id}
                label={item.label}
                icon={item.icon}
                onClick={() => setScreen(item.id)}
              />
            ))}
          </nav>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-auto inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </aside>

        <main className="flex-1 px-4 pb-28 pt-4 md:px-6 xl:px-8 xl:pb-8 xl:pt-5">
          <div className="mx-auto max-w-7xl space-y-5">
            <div className="flex items-center justify-between rounded-[28px] bg-white p-4 shadow-panel">
              <div>
                <p className="text-sm text-slate-500">{workspace?.school_name ?? ""}</p>
                <h1 className="text-2xl font-bold text-slate-900">{workspace?.name ?? "ClassBoard"}</h1>
              </div>
              <div className="flex items-center gap-3">
                <PlanBadge plan={activePlan} />
                <button
                  type="button"
                  onClick={requestNotifications}
                  className="hidden h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 md:inline-flex"
                >
                  <Bell className="h-4 w-4" />
                  {notificationPermission === "granted"
                    ? "Notificações ativas"
                    : notificationPermission === "denied"
                    ? "Permissão negada"
                    : notificationPermission === "unsupported"
                    ? "Sem suporte"
                    : "Ativar notificações"}
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((prev) => !prev)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-700 xl:hidden"
                >
                  {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {mobileMenuOpen ? (
              <div className="rounded-[28px] bg-white p-4 shadow-panel xl:hidden">
                <div className="space-y-2">
                  {navItems.map((item) => (
                    <SidebarButton
                      key={item.id}
                      active={screen === item.id}
                      label={item.label}
                      icon={item.icon}
                      onClick={() => {
                        setScreen(item.id);
                        setMobileMenuOpen(false);
                      }}
                      compact
                    />
                  ))}
                  <a
                    href={INSTAGRAM_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Instagram className="h-4 w-4" /> Contato
                  </a>
                </div>
              </div>
            ) : null}

            {message && <AlertBanner tone="success" message={message} />}
            {errorMessage && <AlertBanner tone="error" message={errorMessage} />}

            {loadingData ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-[30px] bg-white shadow-panel">
                <div className="flex items-center gap-3 text-slate-600">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> Carregando...
                </div>
              </div>
            ) : (
              <>
                {screen === "plans" && (
                  <PlansScreen
                    selectedPlanCode={selectedPlanCode}
                    onSelectPlan={setSelectedPlanCode}
                    currentPlan={activePlan}
                    workspace={workspace}
                  />
                )}

                {workspace && !accessGranted && screen !== "admin" ? (
                  <Panel title="Status do plano">
                    <p className="text-slate-700">Seu pedido está em análise manual.</p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <a
                        href={INSTAGRAM_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 font-semibold text-white transition hover:bg-brand-700"
                      >
                        <Instagram className="h-4 w-4" /> Falar com o proprietário
                      </a>
                      <button
                        type="button"
                        onClick={() => setScreen("workspace")}
                        className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 px-5 font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Revisar dados do espaço
                      </button>
                    </div>
                  </Panel>
                ) : null}

                {workspace && accessGranted && screen === "dashboard" && (
                  <div className="space-y-5">
                    <section className="rounded-[30px] bg-gradient-to-r from-brand-600 to-sky-500 p-6 text-white shadow-panel">
                      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="flex items-center gap-2 text-sm text-blue-100">
                            <Home className="h-4 w-4" /> {workspace.name}
                          </div>
                          <h2 className="mt-2 text-3xl font-bold">
                            Olá{session.user.user_metadata?.full_name ? `, ${String(session.user.user_metadata.full_name)}` : ""}!
                          </h2>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <QuickMetric label="Concluídas" value={String(doneCount)} tone="bg-white/15" />
                          <QuickMetric label="Pendentes" value={String(pendingCount)} tone="bg-white/15" />
                          <QuickMetric label="Membros" value={String(members.length)} tone="bg-white/15" />
                        </div>
                      </div>
                    </section>

                    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                      <Panel title="Hoje">
                        <div className="space-y-3">
                          {todayTasks.length ? todayTasks.map((task) => <TaskRow key={task.id} task={task} onEdit={() => openEditTask(task)} />) : <EmptyState text="Nenhuma tarefa para hoje." />}
                        </div>
                      </Panel>

                      <div className="grid gap-5">
                        <Panel title="Próximas provas">
                          <div className="space-y-3">
                            {upcomingTests.length ? upcomingTests.map((task) => <CompactTaskRow key={task.id} task={task} onEdit={() => openEditTask(task)} />) : <EmptyState text="Sem provas próximas." />}
                          </div>
                        </Panel>

                        <Panel title="Pendências">
                          <div className="space-y-3">
                            {pendingTasks.length ? pendingTasks.map((task) => <CompactTaskRow key={task.id} task={task} onEdit={() => openEditTask(task)} />) : <EmptyState text="Sem pendências." />}
                          </div>
                        </Panel>
                      </div>
                    </div>
                  </div>
                )}

                {workspace && accessGranted && screen === "tasks" && (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <h2 className="text-3xl font-bold text-slate-900">Tarefas</h2>
                      <button
                        type="button"
                        onClick={openCreateTask}
                        disabled={!accessGranted || taskLimitReached}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Plus className="h-4 w-4" /> Nova tarefa
                      </button>
                    </div>

                    <Panel title="Filtros">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="relative w-full lg:max-w-md">
                          <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
                          <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por tarefa ou matéria"
                            className="h-12 w-full rounded-2xl border border-slate-200 pl-11 pr-4"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            ["todos", "Todos"],
                            ["proximas", "Próximas"],
                            ["provas", "Provas"],
                            ["concluidas", "Concluídas"],
                          ].map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setTaskFilter(key as typeof taskFilter)}
                              className={`inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-medium transition ${
                                taskFilter === key ? "bg-brand-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </Panel>

                    <div className="grid gap-5 xl:grid-cols-2">
                      {filteredTasks.length ? (
                        filteredTasks.map((task) => (
                          <TaskCard key={task.id} task={task} onToggleChecklist={toggleChecklist} onEdit={() => openEditTask(task)} groups={groups} />
                        ))
                      ) : (
                        <Panel title="Lista">
                          <EmptyState text="Nenhuma tarefa cadastrada." />
                        </Panel>
                      )}
                    </div>
                  </div>
                )}

                {workspace && accessGranted && screen === "calendar" && (
                  <Panel title="Calendário">
                    <div className="grid gap-4 md:grid-cols-5">
                      {weeklyCalendar.map((day) => (
                        <div key={day.iso} className="min-h-[200px] rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold uppercase text-slate-900">{day.dayLabel}</p>
                              <p className="text-sm text-slate-500">{formatDate(day.iso)}</p>
                            </div>
                            <CalendarDays className="h-5 w-5 text-slate-400" />
                          </div>
                          <div className="mt-5 space-y-3">
                            {day.items.length ? day.items.map((task) => (
                              <button
                                key={task.id}
                                type="button"
                                onClick={() => openEditTask(task)}
                                className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-brand-200 hover:bg-brand-50/30"
                              >
                                <p className="font-medium text-slate-900">{task.title}</p>
                                <p className="mt-1 text-sm text-slate-500">{task.subject}</p>
                              </button>
                            )) : <EmptyState text="Sem itens." compact />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}

                {screen === "workspace" && (
                  <div className="space-y-5">
                    <Panel title={workspace ? "Configuração do espaço" : "Configuração inicial"}>
                      <form className="grid gap-5 lg:grid-cols-[1fr_0.8fr]" onSubmit={handleSaveWorkspace}>
                        <div className="grid gap-5">
                          <label className="grid gap-2">
                            <span className="text-sm font-medium text-slate-700">Nome da escola</span>
                            <input
                              value={workspaceForm.schoolName}
                              onChange={(e) => setWorkspaceForm((prev) => ({ ...prev, schoolName: e.target.value }))}
                              className="h-12 rounded-2xl border border-slate-200 px-4"
                              placeholder="Ex.: Escola Modelo"
                            />
                          </label>
                          <label className="grid gap-2">
                            <span className="text-sm font-medium text-slate-700">Nome do espaço</span>
                            <input
                              required
                              value={workspaceForm.className}
                              onChange={(e) => setWorkspaceForm((prev) => ({ ...prev, className: e.target.value }))}
                              className="h-12 rounded-2xl border border-slate-200 px-4"
                              placeholder="Ex.: Turma 2ºB"
                            />
                          </label>
                          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-sm font-semibold text-slate-900">Plano padrão da conta</p>
                            <p className="mt-2 text-sm text-slate-600">
                              Toda conta nova começa com o <strong>Individual Gratuito</strong>. Para migrar para Grupo ou Turma, use a área de planos ou fale com o proprietário.
                            </p>
                          </div>
                          <div className="flex justify-end">
                            <button
                              type="submit"
                              disabled={savingWorkspace}
                              className="inline-flex h-12 items-center justify-center rounded-2xl bg-brand-600 px-5 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {savingWorkspace ? "Salvando..." : workspace ? "Salvar alterações" : "Criar espaço"}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-5">
                          <InfoCard title="Plano atual" icon={<Crown className="h-5 w-5 text-brand-600" />}>
                            <p className="font-semibold text-slate-900">{getPlanDefinition(activePlan?.plan_code ?? "individual_free")?.title ?? "Individual Gratuito"}</p>
                            <p className="mt-2 text-sm text-slate-600">
                              {activePlan?.status === "active"
                                ? "Seu acesso atual está liberado."
                                : "Seu acesso ainda não está liberado."}
                            </p>
                          </InfoCard>
                          <InfoCard title="Contato" icon={<Instagram className="h-5 w-5 text-brand-600" />}>
                            <a
                              href={INSTAGRAM_URL}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              <Instagram className="h-4 w-4" /> @vt._rodrxgs
                            </a>
                          </InfoCard>
                          {workspace ? (
                            <InfoCard title="Convite" icon={<Copy className="h-5 w-5 text-brand-600" />}>
                              <p className="text-sm text-slate-500">Código</p>
                              <p className="mt-2 text-2xl font-bold text-slate-900">{workspace.invite_code}</p>
                              <button
                                type="button"
                                onClick={copyInviteLink}
                                disabled={!canInviteMembers}
                                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Copy className="h-4 w-4" /> Copiar link
                              </button>
                            </InfoCard>
                          ) : null}
                        </div>
                      </form>
                    </Panel>

                    {workspace ? (
                      <>
                        <Panel title="Membros">
                          <div className="space-y-3">
                            {members.length ? members.map((member) => (
                              <div key={member.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                                <p className="font-medium text-slate-900">{member.profile?.full_name || member.profile?.email || "Usuário"}</p>
                                <p className="text-sm text-slate-500">{member.profile?.email || "Sem email"} • {member.role}</p>
                              </div>
                            )) : <EmptyState text="Sem membros." compact />}
                          </div>
                        </Panel>

                        <Panel title="Grupos">
                          {!canUseGroups ? (
                            <EmptyState text="Seu plano atual não permite grupos." />
                          ) : (
                            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                              <form className="grid gap-4" onSubmit={handleCreateGroup}>
                                <label className="grid gap-2">
                                  <span className="text-sm font-medium text-slate-700">Nome</span>
                                  <input
                                    value={groupForm.name}
                                    onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
                                    className="h-12 rounded-2xl border border-slate-200 px-4"
                                    placeholder="Ex.: Grupo de Física"
                                  />
                                </label>
                                <label className="grid gap-2">
                                  <span className="text-sm font-medium text-slate-700">Descrição</span>
                                  <textarea
                                    value={groupForm.description}
                                    onChange={(e) => setGroupForm((prev) => ({ ...prev, description: e.target.value }))}
                                    className="min-h-[120px] rounded-2xl border border-slate-200 px-4 py-3"
                                  />
                                </label>
                                <button
                                  type="submit"
                                  disabled={savingGroup}
                                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-brand-600 px-5 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  {savingGroup ? "Salvando..." : "Criar grupo"}
                                </button>
                              </form>
                              <div className="space-y-3">
                                {groups.length ? groups.map((group) => (
                                  <div key={group.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                                    <p className="font-semibold text-slate-900">{group.name}</p>
                                    <p className="mt-1 text-sm text-slate-500">{group.description || "Sem descrição"}</p>
                                  </div>
                                )) : <EmptyState text="Nenhum grupo criado." />}
                              </div>
                            </div>
                          )}
                        </Panel>
                      </>
                    ) : null}
                  </div>
                )}

                {isAdmin && screen === "admin" && (
                  <div className="space-y-5">
                    <Panel title="Painel admin">
                      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="relative w-full lg:max-w-md">
                          <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
                          <input
                            value={adminSearch}
                            onChange={(e) => setAdminSearch(e.target.value)}
                            placeholder="Buscar por email, nome ou workspace"
                            className="h-12 w-full rounded-2xl border border-slate-200 pl-11 pr-4"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void loadAdminRows()}
                          className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 px-5 font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          Atualizar lista
                        </button>
                      </div>

                      {adminLoading ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-4 text-slate-600">
                          <Loader2 className="h-4 w-4 animate-spin" /> Carregando painel admin...
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {filteredAdminRows.length ? filteredAdminRows.map((row) => (
                            <div key={row.workspace.id} className="rounded-3xl border border-slate-200 p-4">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                  <p className="text-lg font-semibold text-slate-900">{row.workspace.name}</p>
                                  <p className="text-sm text-slate-500">{row.ownerProfile?.email || "Sem email"}</p>
                                  <p className="mt-1 text-sm text-slate-500">{row.workspace.school_name || "Sem escola"} • {row.memberCount} membro(s)</p>
                                  <p className="mt-1 text-sm text-slate-500">Plano: {PLAN_DEFINITIONS[row.plan?.plan_code ?? "individual_free"].title} • Status: {row.plan?.status ?? "sem registro"}</p>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-3">
                                  {PLAN_ORDER.map((planCode) => (
                                    <button
                                      key={planCode}
                                      type="button"
                                      onClick={() => void handleAdminUpdate(row, planCode, "active")}
                                      disabled={adminSavingWorkspaceId === row.workspace.id}
                                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Liberar {PLAN_DEFINITIONS[planCode].title}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => void handleAdminUpdate(row, row.plan?.plan_code ?? "individual_free", "pending")}
                                    disabled={adminSavingWorkspaceId === row.workspace.id}
                                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-amber-500 px-4 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Deixar pendente
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleAdminUpdate(row, row.plan?.plan_code ?? "individual_free", "inactive")}
                                    disabled={adminSavingWorkspaceId === row.workspace.id}
                                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Inativar
                                  </button>
                                </div>
                              </div>
                            </div>
                          )) : <EmptyState text="Nenhum workspace encontrado." />}
                        </div>
                      )}
                    </Panel>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-panel xl:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-around gap-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setScreen(item.id)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium transition ${
                screen === item.id ? "bg-brand-50 text-brand-700" : "text-slate-600"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function BrandPanel({ onContact = false }: { onContact?: boolean }) {
  return (
    <div className="space-y-5 px-2">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-950/40">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold">ClassBoard</p>
        </div>
      </div>
      {onContact ? (
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10"
        >
          <Instagram className="h-4 w-4" /> @vt._rodrxgs
        </a>
      ) : null}
    </div>
  );
}

function PlansScreen({
  selectedPlanCode,
  onSelectPlan,
  currentPlan,
  workspace,
}: {
  selectedPlanCode: PlanCode;
  onSelectPlan: (planCode: PlanCode) => void;
  currentPlan: WorkspacePlan | null;
  workspace: Workspace | null;
}) {
  const currentDefinition = getPlanDefinition(currentPlan?.plan_code ?? "individual_free");

  return (
    <div className="space-y-5">
      <Panel title="Planos">
        <div className="grid gap-4 lg:grid-cols-3">
          {PLAN_ORDER.map((planCode) => {
            const plan = PLAN_DEFINITIONS[planCode];
            const selected = selectedPlanCode === planCode;
            const current = currentPlan?.plan_code === planCode;
            return (
              <button
                key={plan.code}
                type="button"
                onClick={() => onSelectPlan(plan.code)}
                className={`rounded-[28px] border p-5 text-left transition ${
                  selected ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-slate-900">{plan.title}</p>
                  {current ? <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Atual</span> : null}
                </div>
                <p className="mt-3 text-sm text-slate-600">{plan.subtitle}</p>
                <div className="mt-4 space-y-2 text-sm text-slate-500">
                  <p>{plan.limits.maxMembers} membro(s)</p>
                  <p>{plan.limits.maxActiveTasks} tarefas ativas</p>
                  <p>{plan.features.attachments ? "Com anexos" : "Sem anexos"}</p>
                  <p>{plan.features.groups ? `${plan.limits.maxGroups} grupo(s)` : "Sem grupos"}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <Panel title="Plano atual e upgrade manual">
          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">Plano ativo</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{currentDefinition?.title ?? "Individual Gratuito"}</p>
              <p className="mt-2 text-sm text-slate-600">
                {currentPlan?.status === "active"
                  ? "Seu plano atual está liberado e funcionando normalmente."
                  : "Seu plano atual ainda não está ativo."}
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">Como pedir mudança de plano</p>
              <p className="mt-2 text-sm text-slate-600">
                Selecione o plano desejado acima e fale com o proprietário para liberar manualmente no painel admin.
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {workspace
                  ? `Espaço atual: ${workspace.name}${workspace.school_name ? ` • ${workspace.school_name}` : ""}`
                  : "Crie primeiro seu espaço na área de configuração para facilitar a liberação."}
              </p>
            </div>
          </div>
        </Panel>

        <div className="space-y-5">
          <InfoCard title="Contato" icon={<Instagram className="h-5 w-5 text-brand-600" />}>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Instagram className="h-4 w-4" /> @vt._rodrxgs
            </a>
          </InfoCard>
          <InfoCard title="Regras do produto" icon={<AlertCircle className="h-5 w-5 text-brand-600" />}>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>• Toda conta nova começa no Individual Gratuito.</li>
              <li>• Grupo e Turma são liberados manualmente pelo admin.</li>
              <li>• O login continua limpo; planos ficam nesta área separada.</li>
            </ul>
          </InfoCard>
        </div>
      </div>
    </div>
  );
}

function SidebarButton({
  active,
  label,
  icon,
  onClick,
  compact = false,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl ${compact ? "px-3 py-3" : "px-4 py-4"} text-left transition ${
        active ? "bg-brand-600 text-white shadow-lg shadow-brand-950/30" : compact ? "text-slate-700 hover:bg-slate-50" : "text-slate-200 hover:bg-white/5"
      }`}
    >
      {icon}
      <span className="text-base font-medium">{label}</span>
    </button>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[30px] bg-white p-6 shadow-panel">
      <h3 className="text-2xl font-bold text-slate-900">{title}</h3>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center gap-3">
        {icon}
        <p className="font-semibold text-slate-900">{title}</p>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function AlertBanner({ tone, message }: { tone: "success" | "error"; message: string }) {
  const toneClasses =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700";
  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${toneClasses}`}>
      <AlertCircle className="h-4 w-4" /> {message}
    </div>
  );
}

function PlanBadge({ plan }: { plan: WorkspacePlan | null }) {
  const definition = getPlanDefinition(plan?.plan_code ?? null);
  const label = definition?.title ?? "Sem plano";
  const tone = !plan ? "bg-slate-100 text-slate-700" : plan.status === "active" ? "bg-emerald-50 text-emerald-700" : plan.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded-full px-3 py-2 text-xs font-semibold ${tone}`}>{label}</span>;
}

function QuickMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-[24px] px-5 py-4 ${tone}`}>
      <p className="text-4xl font-bold">{value}</p>
      <p className="mt-1 text-lg">{label}</p>
    </div>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-500 ${compact ? "px-4 py-3 text-sm" : "px-5 py-10"}`}>
      {text}
    </div>
  );
}

function TaskRow({ task, onEdit }: { task: Task; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-brand-200 hover:bg-brand-50/30"
    >
      <div>
        <p className="font-semibold text-slate-900">{task.title}</p>
        <p className="mt-1 text-sm text-slate-500">{task.subject}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`rounded-xl border px-3 py-1 text-sm font-medium ${mapUrgency(task.due_date)}`}>{humanDueLabel(task.due_date)}</span>
        <Pencil className="h-4 w-4 text-slate-400" />
      </div>
    </button>
  );
}

function CompactTaskRow({ task, onEdit }: { task: Task; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-brand-200 hover:bg-brand-50/30"
    >
      <div>
        <p className="text-xl font-semibold text-slate-900">{task.subject}</p>
        <p className="text-slate-500">{task.title}</p>
      </div>
      <div className="text-right">
        <p className="text-2xl font-bold text-brand-600">{humanDueLabel(task.due_date).replace("Em ", "")}</p>
        <p className="text-sm text-slate-400">{formatDate(task.due_date)}</p>
      </div>
    </button>
  );
}

function TaskCard({
  task,
  onToggleChecklist,
  onEdit,
  groups,
}: {
  task: Task;
  onToggleChecklist: (task: Task, item: ChecklistItem) => Promise<void> | void;
  onEdit: () => void;
  groups: WorkspaceGroup[];
}) {
  const progress = calculateProgress(task.checklist_items);
  const groupName = groups.find((group) => group.id === task.group_id)?.name;

  return (
    <section className="rounded-[30px] bg-white p-6 shadow-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <span className={`rounded-xl border px-3 py-1 text-sm font-medium ${mapPriority(task.priority)}`}>{task.priority}</span>
            <span className={`rounded-xl border px-3 py-1 text-sm font-medium ${mapUrgency(task.due_date)}`}>{humanDueLabel(task.due_date)}</span>
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">{statusLabel(task.status)}</span>
            {groupName ? <span className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">{groupName}</span> : null}
          </div>
          <h3 className="text-2xl font-bold text-slate-900">{task.title}</h3>
          <p className="mt-1 text-slate-500">{task.subject}</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-slate-600">Progresso</span>
          <span className="font-semibold text-slate-900">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {task.description ? <p className="mt-5 text-sm leading-relaxed text-slate-600">{task.description}</p> : null}

      <div className="mt-5 space-y-2">
        {task.checklist_items.length ? task.checklist_items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => void onToggleChecklist(task, item)}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50"
          >
            <span className={`${item.is_done ? "text-slate-400 line-through" : "text-slate-700"}`}>{item.content}</span>
            <CheckCircle2 className={`h-5 w-5 ${item.is_done ? "text-emerald-500" : "text-slate-300"}`} />
          </button>
        )) : <EmptyState text="Sem checklist." compact />}
      </div>

      {task.attachment_name && task.attachment_url ? (
        <a
          href={task.attachment_url}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <Link2 className="h-4 w-4" /> {task.attachment_name}
        </a>
      ) : null}
    </section>
  );
}
