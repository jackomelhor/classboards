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
  Home,
  Link2,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  ChecklistItem,
  Priority,
  Task,
  TaskFormValues,
  TaskStatus,
  TaskType,
  UserProfile,
  Workspace,
  WorkspaceGroup,
  WorkspaceMember,
  WorkspaceType,
} from "@/lib/types";
import { TaskForm } from "@/components/task-form";

type Screen = "dashboard" | "tasks" | "calendar" | "workspace";
type AuthMode = "signin" | "signup";

type WorkspaceMembershipQuery = {
  workspace_id: string;
  role: string;
  workspaces: Workspace | Workspace[] | null;
};

type WorkspaceFormValues = {
  schoolName: string;
  className: string;
  workspaceType: WorkspaceType;
};

const emptyWorkspaceForm: WorkspaceFormValues = {
  schoolName: "",
  className: "",
  workspaceType: "turma",
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

function typeLabel(type: TaskType) {
  const labels: Record<TaskType, string> = {
    prova: "Prova",
    trabalho: "Trabalho",
    atividade: "Atividade",
    apresentacao: "Apresentação",
  };
  return labels[type];
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
    workspaceType: workspace.workspace_type,
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

function getUserDisplayName(session: Session | null) {
  const metadataName = session?.user?.user_metadata?.full_name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();
  const email = session?.user?.email;
  if (email) return email.split("@")[0];
  return "usuário";
}

function formatRole(role: WorkspaceMember["role"]) {
  return role === "owner" ? "Dono" : "Membro";
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

export function ClassBoardApp() {
  const localMode = !isSupabaseConfigured || !supabase;

  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [submittingAuth, setSubmittingAuth] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceFormValues>(emptyWorkspaceForm);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskFormMode, setTaskFormMode] = useState<"create" | "edit">("create");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const [taskFilter, setTaskFilter] = useState<"todos" | "proximas" | "provas" | "concluidas">("todos");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

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
    if (localMode) return;

    if (!session?.user) {
      setWorkspace(null);
      setMembers([]);
      setGroups([]);
      setTasks([]);
      setWorkspaceForm(emptyWorkspaceForm);
      return;
    }

    void bootstrapWorkspace(session.user);
  }, [localMode, session?.user?.id]);

  useEffect(() => {
    setNotificationPermission(
      typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
    );
  }, []);

  useEffect(() => {
    if (notificationPermission !== "granted") return;
    if (!tasks.length) return;
    if (typeof window === "undefined") return;

    const priorityWindows = [0, 1, 3];
    const dueSoon = tasks.filter(
      (task) => priorityWindows.includes(diffInDays(task.due_date)) && task.status !== "concluida"
    );
    if (!dueSoon.length) return;

    dueSoon.sort((a, b) => diffInDays(a.due_date) - diffInDays(b.due_date));
    const nextTask = dueSoon[0];
    const days = diffInDays(nextTask.due_date);
    const cacheKey = `classboard-notified-${nextTask.id}-${days}`;
    if (window.sessionStorage.getItem(cacheKey)) return;

    new Notification("ClassBoard", {
      body: `${nextTask.title} • ${humanDueLabel(nextTask.due_date)}`,
    });
    window.sessionStorage.setItem(cacheKey, "1");
  }, [notificationPermission, tasks]);

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
      const groupNameLookup = groups.find((group) => group.id === task.group_id)?.name ?? "";
      const matchesSearch = `${task.title} ${task.subject} ${groupNameLookup}`
        .toLowerCase()
        .includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (taskFilter === "proximas") return diffInDays(task.due_date) <= 3;
      if (taskFilter === "provas") return task.task_type === "prova";
      if (taskFilter === "concluidas") return task.status === "concluida";
      return true;
    });
  }, [groups, tasks, search, taskFilter]);

  async function bootstrapWorkspace(user: User) {
    const client = supabase;
    if (!client) return;

    setLoadingData(true);
    setErrorMessage(null);

    try {
      const membershipQuery = await client
        .from("workspace_members")
        .select("workspace_id, role, workspaces(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (membershipQuery.error) throw membershipQuery.error;

      const row = membershipQuery.data?.[0] as WorkspaceMembershipQuery | undefined;
      if (!row) {
        setWorkspace(null);
        setMembers([]);
        setGroups([]);
        setTasks([]);
        setWorkspaceForm(emptyWorkspaceForm);
        setScreen("workspace");
        return;
      }

      const currentWorkspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
      setWorkspace(currentWorkspace ?? null);

      if (currentWorkspace) {
        setWorkspaceForm(workspaceToFormValues(currentWorkspace));
        await loadWorkspaceBundle(currentWorkspace.id);
      }
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível carregar os dados.";
      setErrorMessage(nextMessage);
    } finally {
      setLoadingData(false);
    }
  }

  async function loadWorkspaceBundle(workspaceId: string) {
    await Promise.all([loadTasks(workspaceId), loadGroups(workspaceId), loadMembers(workspaceId)]);
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

    const query = await client
      .from("groups")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (query.error) throw query.error;
    setGroups((query.data ?? []) as WorkspaceGroup[]);
  }

  async function loadMembers(workspaceId: string) {
    const client = supabase;
    if (!client) return;

    const membershipQuery = await client
      .from("workspace_members")
      .select("id, workspace_id, user_id, role, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (membershipQuery.error) throw membershipQuery.error;

    const rows = (membershipQuery.data ?? []) as WorkspaceMember[];
    const userIds = [...new Set(rows.map((row) => row.user_id))];

    let profilesMap = new Map<string, UserProfile>();

    if (userIds.length) {
      const profilesQuery = await client.from("user_profiles").select("*").in("user_id", userIds);
      if (!profilesQuery.error) {
        profilesMap = new Map(
          ((profilesQuery.data ?? []) as UserProfile[]).map((profile) => [profile.user_id, profile])
        );
      }
    }

    setMembers(rows.map((row) => ({ ...row, profile: profilesMap.get(row.user_id) ?? null })));
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
      if (!client) throw new Error("Supabase não configurado.");

      if (authMode === "signup") {
        const check = await client.rpc("email_exists", { candidate_email: email.trim().toLowerCase() });
        if (!check.error && check.data) {
          throw new Error("Este email já tem conta. Use Entrar.");
        }

        const response = await client.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (response.error) {
          if (/already registered|already been registered|user already registered/i.test(response.error.message)) {
            throw new Error("Este email já tem conta. Use Entrar.");
          }
          throw response.error;
        }

        if (response.data.session) {
          setSession(response.data.session);
          setEmail("");
          setPassword("");
        } else {
          setMessage(
            "Conta criada. Para entrar sem email de verificação, desative Confirm email no Supabase e tente novamente."
          );
        }
      } else {
        const response = await client.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (response.error) {
          if (/invalid login credentials/i.test(response.error.message)) {
            throw new Error("Email ou senha inválidos.");
          }
          throw response.error;
        }
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

    if (localMode) {
      setSession(null);
      setWorkspace(null);
      setMembers([]);
      setGroups([]);
      setTasks([]);
      setWorkspaceForm(emptyWorkspaceForm);
      return;
    }

    const client = supabase;
    if (!client) {
      setErrorMessage("Supabase não configurado.");
      return;
    }

    await client.auth.signOut();
    setWorkspace(null);
    setMembers([]);
    setGroups([]);
    setTasks([]);
    setWorkspaceForm(emptyWorkspaceForm);
  }

  async function handleSaveWorkspace(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSavingWorkspace(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const payload = {
        school_name: workspaceForm.schoolName.trim() || null,
        name: workspaceForm.className.trim(),
        workspace_type: workspaceForm.workspaceType,
      };

      if (!payload.name) {
        throw new Error("Informe o nome da turma, grupo ou espaço individual.");
      }

      if (localMode) {
        const ownerId = session?.user?.id ?? "local-user";
        const nextWorkspace: Workspace = {
          id: workspace?.id ?? crypto.randomUUID(),
          owner_id: ownerId,
          invite_code: workspace?.invite_code ?? Math.random().toString(36).slice(2, 10).toUpperCase(),
          ...payload,
        };
        setWorkspace(nextWorkspace);
        setScreen("dashboard");
        return;
      }

      const client = supabase;
      const currentUserId = session?.user?.id;
      if (!currentUserId || !client) {
        throw new Error("Sessão não encontrada.");
      }

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

        setWorkspace(insertedWorkspace.data as Workspace);
        setWorkspaceForm(workspaceToFormValues(insertedWorkspace.data as Workspace));
        setTasks([]);
        setGroups([]);
        setMembers([]);
      } else {
        const updatedWorkspace = await client
          .from("workspaces")
          .update(payload)
          .eq("id", workspace.id)
          .select("*")
          .single();

        if (updatedWorkspace.error) throw updatedWorkspace.error;
        setWorkspace(updatedWorkspace.data as Workspace);
        setWorkspaceForm(workspaceToFormValues(updatedWorkspace.data as Workspace));
      }

      setMessage("Informações salvas.");
      setScreen("dashboard");
      if (workspace?.id) {
        await loadWorkspaceBundle(workspace.id);
      }
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível salvar as informações.";
      setErrorMessage(nextMessage);
    } finally {
      setSavingWorkspace(false);
    }
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;

    setSavingGroup(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const trimmedName = groupName.trim();
      if (!trimmedName) throw new Error("Informe o nome do grupo.");

      if (localMode || !supabase || !session?.user) {
        const nextGroup: WorkspaceGroup = {
          id: crypto.randomUUID(),
          workspace_id: workspace.id,
          created_by: session?.user?.id ?? "local-user",
          name: trimmedName,
          description: groupDescription.trim() || null,
          created_at: new Date().toISOString(),
        };
        setGroups((prev) => [...prev, nextGroup]);
      } else {
        const client = supabase;
        const insert = await client.from("groups").insert({
          workspace_id: workspace.id,
          created_by: session.user.id,
          name: trimmedName,
          description: groupDescription.trim() || null,
        });
        if (insert.error) throw insert.error;
        await loadGroups(workspace.id);
      }

      setGroupName("");
      setGroupDescription("");
      setMessage("Grupo criado.");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível criar o grupo.";
      setErrorMessage(nextMessage);
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleDeleteGroup(group: WorkspaceGroup) {
    if (!workspace) return;
    setDeletingGroupId(group.id);
    setErrorMessage(null);
    setMessage(null);

    try {
      if (localMode || !supabase) {
        setGroups((prev) => prev.filter((item) => item.id !== group.id));
        setTasks((prev) => prev.map((task) => (task.group_id === group.id ? { ...task, group_id: null } : task)));
      } else {
        const client = supabase;
        const deleteGroup = await client.from("groups").delete().eq("id", group.id);
        if (deleteGroup.error) throw deleteGroup.error;
        await Promise.all([loadGroups(workspace.id), loadTasks(workspace.id)]);
      }
      setMessage("Grupo removido.");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível remover o grupo.";
      setErrorMessage(nextMessage);
    } finally {
      setDeletingGroupId(null);
    }
  }

  function openCreateTask() {
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
              group_id: values.groupId || null,
              attachment_name: attachment?.attachment_name ?? null,
              attachment_url: attachment?.attachment_url ?? null,
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
                      group_id: values.groupId || null,
                      attachment_name: values.file?.name ?? task.attachment_name,
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
              group_id: values.groupId || null,
              attachment_name: attachment?.attachment_name ?? selectedTask.attachment_name,
              attachment_url: attachment?.attachment_url ?? selectedTask.attachment_url,
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
              ? { ...currentTask, status: nextStatus, checklist_items: updatedItems }
              : currentTask
          )
        );
        return;
      }

      const client = supabase;
      const checklistUpdate = await client
        .from("checklist_items")
        .update({ is_done: !item.is_done })
        .eq("id", item.id);
      if (checklistUpdate.error) throw checklistUpdate.error;

      const taskUpdate = await client.from("tasks").update({ status: nextStatus }).eq("id", task.id);
      if (taskUpdate.error) throw taskUpdate.error;

      setTasks((prev) =>
        prev.map((currentTask) =>
          currentTask.id === task.id
            ? { ...currentTask, status: nextStatus, checklist_items: updatedItems }
            : currentTask
        )
      );
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Não foi possível atualizar o checklist.";
      setErrorMessage(nextMessage);
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

  const currentUserName = getUserDisplayName(session);

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

  if (!session?.user && !localMode) {
    return (
      <div className="auth-grid-bg min-h-screen px-4 py-6 text-white md:px-6 lg:px-8">
        <div className="mx-auto grid min-h-[92vh] max-w-7xl gap-4 lg:grid-cols-[200px_1fr_0.95fr] lg:gap-6">
          <aside className="hidden rounded-[30px] border border-white/10 bg-white/5 p-5 backdrop-blur lg:flex lg:flex-col lg:justify-between">
            <div className="space-y-6">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-950/40">
                <BookOpen className="h-5 w-5" />
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setAuthMode("signin")}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition ${
                    authMode === "signin" ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <Mail className="h-4 w-4" /> Entrar
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition ${
                    authMode === "signup"
                      ? "bg-brand-600 text-white shadow-lg shadow-brand-950/40"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <Users className="h-4 w-4" /> Criar conta
                </button>
              </div>
            </div>
          </aside>

          <section className="flex rounded-[34px] border border-white/10 bg-gradient-to-br from-brand-500 via-blue-600 to-sky-500 p-6 shadow-2xl shadow-brand-950/30 sm:p-8">
            <div className="flex w-full flex-col justify-between gap-8">
              <div className="space-y-6">
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm backdrop-blur">
                  <BookOpen className="h-4 w-4" /> ClassBoard
                </div>
                <div className="max-w-xl space-y-4">
                  <h1 className="text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
                    Organização escolar no celular e no computador
                  </h1>
                  <p className="max-w-lg text-sm text-blue-100 sm:text-base">
                    Entre, configure a turma e centralize tarefas, provas, calendário, grupos e convites em um único lugar.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-slate-950/85 p-5 backdrop-blur sm:p-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3 lg:hidden">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-950/40">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode("signin")}
                    className={`rounded-2xl px-4 py-2 text-sm ${
                      authMode === "signin" ? "bg-white/10 text-white" : "text-slate-300"
                    }`}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("signup")}
                    className={`rounded-2xl px-4 py-2 text-sm ${
                      authMode === "signup" ? "bg-brand-600 text-white" : "text-slate-300"
                    }`}
                  >
                    Criar conta
                  </button>
                </div>
              </div>

              <div>
                <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
                  {authMode === "signup" ? "Criar conta" : "Entrar"}
                </h2>
              </div>

              {message && <AlertBanner tone="success" message={message} />}
              {errorMessage && <AlertBanner tone="error" message={errorMessage} />}

              <form className="space-y-4" onSubmit={handleAuthSubmit}>
                {authMode === "signup" && (
                  <div className="space-y-2">
                    <label className="text-sm text-slate-300">Nome</label>
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={authMode === "signup"}
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white placeholder:text-slate-500"
                      placeholder="João Silva"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm text-slate-300">Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    type="email"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white placeholder:text-slate-500"
                    placeholder="joao@email.com"
                    autoComplete="email"
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
                    autoComplete={authMode === "signup" ? "new-password" : "current-password"}
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
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!session?.user && localMode) {
    return (
      <div className="auth-grid-bg min-h-screen px-4 py-6 text-white md:px-8 lg:px-10">
        <div className="mx-auto flex min-h-[92vh] max-w-xl items-center">
          <section className="w-full rounded-[30px] border border-white/10 bg-slate-950/85 p-6 backdrop-blur sm:p-8">
            <div className="space-y-6">
              <div>
                <h2 className="mt-1 text-2xl font-bold sm:text-3xl">Entrar</h2>
              </div>
              <form className="space-y-4" onSubmit={handleAuthSubmit}>
                <div className="space-y-2">
                  <label className="text-sm text-slate-300">Nome</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white placeholder:text-slate-500"
                    placeholder="Seu nome"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingAuth}
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-brand-600 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submittingAuth ? "Processando..." : "Entrar"}
                </button>
              </form>
            </div>
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
      />

      <div className="flex min-h-screen">
        <aside className="hidden w-24 border-r border-slate-200 bg-slate-950 px-4 py-6 text-white xl:flex xl:w-72 xl:flex-col xl:gap-6">
          <div className="flex items-center gap-3 px-2">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-950/40">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">ClassBoard</p>
            </div>
          </div>

          <nav className="space-y-2">
            <SidebarButton active={screen === "dashboard"} label="Painel" icon={<Home className="h-5 w-5" />} onClick={() => setScreen("dashboard")} />
            <SidebarButton active={screen === "tasks"} label="Tarefas" icon={<ClipboardList className="h-5 w-5" />} onClick={() => setScreen("tasks")} />
            <SidebarButton active={screen === "calendar"} label="Calendário" icon={<CalendarDays className="h-5 w-5" />} onClick={() => setScreen("calendar")} />
            <SidebarButton active={screen === "workspace"} label="Espaço" icon={<Settings className="h-5 w-5" />} onClick={() => setScreen("workspace")} />
          </nav>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-auto inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </aside>

        <main className="flex-1 px-4 py-4 pb-24 md:px-6 xl:px-8 xl:pb-8">
          <div className="mx-auto max-w-7xl space-y-5">
            <div className="sticky top-0 z-20 rounded-[28px] bg-white/95 p-4 shadow-panel backdrop-blur md:flex md:items-center md:justify-between">
              <div>
                <p className="text-sm text-slate-500">{workspace?.school_name ?? ""}</p>
                <h1 className="text-2xl font-bold text-slate-900">{workspace?.name ?? "Configurar espaço"}</h1>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 md:mt-0">
                <button
                  type="button"
                  onClick={requestNotifications}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
                {workspace ? (
                  <button
                    type="button"
                    onClick={openCreateTask}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"
                  >
                    <Plus className="h-4 w-4" /> Nova tarefa
                  </button>
                ) : null}
              </div>
            </div>

            {message && <AlertBanner tone="success" message={message} />}
            {errorMessage && <AlertBanner tone="error" message={errorMessage} />}

            {loadingData ? (
              <div className="flex min-h-[300px] items-center justify-center rounded-[30px] bg-white shadow-panel">
                <div className="flex items-center gap-3 text-slate-600">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> Carregando...
                </div>
              </div>
            ) : !workspace ? (
              <WorkspaceSetupForm
                values={workspaceForm}
                onChange={setWorkspaceForm}
                onSubmit={handleSaveWorkspace}
                loading={savingWorkspace}
              />
            ) : (
              <>
                {screen === "dashboard" && (
                  <div className="space-y-5">
                    <section className="rounded-[30px] bg-gradient-to-r from-brand-600 to-sky-500 p-5 text-white shadow-panel sm:p-6">
                      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex items-center gap-2 text-sm text-blue-100">
                            <Home className="h-4 w-4" /> {workspace.name} <span className="opacity-60">|</span> {workspace.school_name}
                          </div>
                          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Olá, {currentUserName}!</h2>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <QuickMetric label="Concluídas" value={String(doneCount)} tone="bg-white/15" />
                          <QuickMetric label="Pendentes" value={String(pendingCount)} tone="bg-white/15" />
                          <QuickMetric label="Provas" value={String(upcomingTests.length)} tone="bg-white/15" />
                          <QuickMetric label="Grupos" value={String(groups.length)} tone="bg-white/15" />
                        </div>
                      </div>
                    </section>

                    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                      <Panel title="Hoje">
                        <div className="space-y-3">
                          {todayTasks.length ? (
                            todayTasks.map((task) => <TaskRow key={task.id} task={task} onEdit={() => openEditTask(task)} groupName={groups.find((group) => group.id === task.group_id)?.name ?? null} />)
                          ) : (
                            <EmptyState text="Nenhuma tarefa para hoje." />
                          )}
                        </div>
                      </Panel>

                      <div className="grid gap-5">
                        <Panel title="Próximas Provas">
                          <div className="space-y-3">
                            {upcomingTests.length ? (
                              upcomingTests.map((task) => <CompactTaskRow key={task.id} task={task} onEdit={() => openEditTask(task)} groupName={groups.find((group) => group.id === task.group_id)?.name ?? null} />)
                            ) : (
                              <EmptyState text="Sem provas próximas." />
                            )}
                          </div>
                        </Panel>

                        <Panel title="Tarefas Pendentes">
                          <div className="space-y-3">
                            {pendingTasks.length ? (
                              pendingTasks.map((task) => <CompactTaskRow key={task.id} task={task} onEdit={() => openEditTask(task)} groupName={groups.find((group) => group.id === task.group_id)?.name ?? null} />)
                            ) : (
                              <EmptyState text="Nenhuma pendência agora." />
                            )}
                          </div>
                        </Panel>
                      </div>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
                      <Panel title="Resumo da Semana">
                        <div className="grid gap-4 md:grid-cols-3">
                          <SummaryCard label="Concluídas" value={doneCount} className="bg-brand-600 text-white" />
                          <SummaryCard label="Pendentes" value={pendingCount} className="bg-orange-500 text-white" />
                          <SummaryCard label="Membros" value={members.length} className="bg-emerald-500 text-white" />
                        </div>
                      </Panel>

                      <MembersPanel members={members} />
                    </div>
                  </div>
                )}

                {screen === "tasks" && (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h2 className="text-3xl font-bold text-slate-900">Tarefas</h2>
                      </div>
                    </div>

                    <Panel title="Filtros">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="relative w-full lg:max-w-md">
                          <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
                          <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por tarefa, matéria ou grupo"
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
                                taskFilter === key
                                  ? "bg-brand-600 text-white"
                                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
                          <TaskCard
                            key={task.id}
                            task={task}
                            groupName={groups.find((group) => group.id === task.group_id)?.name ?? null}
                            onToggleChecklist={toggleChecklist}
                            onEdit={() => openEditTask(task)}
                          />
                        ))
                      ) : (
                        <Panel title="Lista">
                          <EmptyState text="Nenhuma tarefa cadastrada." />
                        </Panel>
                      )}
                    </div>
                  </div>
                )}

                {screen === "calendar" && (
                  <Panel title="Calendário">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
                            {day.items.length ? (
                              day.items.map((task) => (
                                <button
                                  key={task.id}
                                  type="button"
                                  onClick={() => openEditTask(task)}
                                  className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-brand-200 hover:bg-brand-50/30"
                                >
                                  <p className="font-medium text-slate-900">{task.title}</p>
                                  <p className="mt-1 text-sm text-slate-500">{task.subject}</p>
                                </button>
                              ))
                            ) : (
                              <EmptyState text="Sem itens." compact />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}

                {screen === "workspace" && (
                  <div className="space-y-5">
                    <WorkspaceSetupForm
                      values={workspaceForm}
                      onChange={setWorkspaceForm}
                      onSubmit={handleSaveWorkspace}
                      loading={savingWorkspace}
                      showInviteSection={Boolean(workspace)}
                      inviteCode={workspace.invite_code}
                      onCopyInvite={copyInviteLink}
                    />

                    <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
                      <GroupsPanel
                        groups={groups}
                        groupName={groupName}
                        setGroupName={setGroupName}
                        groupDescription={groupDescription}
                        setGroupDescription={setGroupDescription}
                        onSubmit={handleCreateGroup}
                        saving={savingGroup}
                        deletingGroupId={deletingGroupId}
                        onDelete={handleDeleteGroup}
                      />
                      <MembersPanel members={members} showEmails />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {workspace ? (
        <MobileBottomNav screen={screen} setScreen={setScreen} onAddTask={openCreateTask} />
      ) : null}
    </div>
  );
}

function WorkspaceSetupForm({
  values,
  onChange,
  onSubmit,
  loading,
  showInviteSection = false,
  inviteCode,
  onCopyInvite,
}: {
  values: WorkspaceFormValues;
  onChange: (values: WorkspaceFormValues) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> | void;
  loading: boolean;
  showInviteSection?: boolean;
  inviteCode?: string;
  onCopyInvite?: () => Promise<void> | void;
}) {
  return (
    <Panel title="Configuração do espaço">
      <form className="grid gap-5 xl:grid-cols-[1fr_0.7fr]" onSubmit={onSubmit}>
        <div className="grid gap-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">Nome da escola</span>
            <input
              value={values.schoolName}
              onChange={(e) => onChange({ ...values, schoolName: e.target.value })}
              className="h-12 rounded-2xl border border-slate-200 px-4"
              placeholder="Ex.: Colégio Alfa"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">Nome da turma ou grupo</span>
            <input
              required
              value={values.className}
              onChange={(e) => onChange({ ...values, className: e.target.value })}
              className="h-12 rounded-2xl border border-slate-200 px-4"
              placeholder="Ex.: Turma 2ºB"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">Tipo</span>
            <select
              value={values.workspaceType}
              onChange={(e) => onChange({ ...values, workspaceType: e.target.value as WorkspaceType })}
              className="h-12 rounded-2xl border border-slate-200 px-4"
            >
              <option value="turma">Turma</option>
              <option value="grupo">Grupo</option>
              <option value="individual">Individual</option>
            </select>
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-brand-600 px-5 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        {showInviteSection ? (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm text-slate-500">Código do convite</p>
            <p className="mt-2 break-all text-2xl font-bold text-slate-900">{inviteCode}</p>
            <button
              type="button"
              onClick={() => void onCopyInvite?.()}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <Copy className="h-4 w-4" /> Copiar link
            </button>
          </div>
        ) : null}
      </form>
    </Panel>
  );
}

function SidebarButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition ${
        active ? "bg-brand-600 text-white shadow-lg shadow-brand-950/40" : "text-slate-200 hover:bg-white/5"
      }`}
    >
      {icon}
      <span className="text-base font-medium">{label}</span>
    </button>
  );
}

function MobileBottomNav({
  screen,
  setScreen,
  onAddTask,
}: {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  onAddTask: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur xl:hidden">
      <div className="grid grid-cols-5 gap-2">
        <BottomButton active={screen === "dashboard"} label="Painel" icon={<Home className="h-5 w-5" />} onClick={() => setScreen("dashboard")} />
        <BottomButton active={screen === "tasks"} label="Tarefas" icon={<ClipboardList className="h-5 w-5" />} onClick={() => setScreen("tasks")} />
        <button
          type="button"
          onClick={onAddTask}
          className="inline-flex h-14 flex-col items-center justify-center rounded-2xl bg-brand-600 text-white"
        >
          <Plus className="h-5 w-5" />
          <span className="text-[11px] font-medium">Nova</span>
        </button>
        <BottomButton active={screen === "calendar"} label="Agenda" icon={<CalendarDays className="h-5 w-5" />} onClick={() => setScreen("calendar")} />
        <BottomButton active={screen === "workspace"} label="Espaço" icon={<Settings className="h-5 w-5" />} onClick={() => setScreen("workspace")} />
      </div>
    </div>
  );
}

function BottomButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-14 flex-col items-center justify-center rounded-2xl text-[11px] font-medium ${
        active ? "bg-brand-50 text-brand-700" : "text-slate-600"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[30px] bg-white p-5 shadow-panel sm:p-6">
      <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h3>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function AlertBanner({ tone, message }: { tone: "success" | "error"; message: string }) {
  const toneClasses = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700";
  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${toneClasses}`}>
      <AlertCircle className="h-4 w-4" /> {message}
    </div>
  );
}

function QuickMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-[24px] px-5 py-4 ${tone}`}>
      <p className="text-3xl font-bold sm:text-4xl">{value}</p>
      <p className="mt-1 text-base sm:text-lg">{label}</p>
    </div>
  );
}

function TaskRow({ task, onEdit, groupName }: { task: Task; onEdit: () => void; groupName: string | null }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-brand-200 hover:bg-brand-50/30 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-semibold text-slate-900">{task.title}</p>
        <p className="mt-1 text-sm text-slate-500">{task.subject}{groupName ? ` • ${groupName}` : ""}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`rounded-xl border px-3 py-1 text-sm font-medium ${mapUrgency(task.due_date)}`}>{humanDueLabel(task.due_date)}</span>
        <Pencil className="h-4 w-4 text-slate-400" />
      </div>
    </button>
  );
}

function CompactTaskRow({ task, onEdit, groupName }: { task: Task; onEdit: () => void; groupName: string | null }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-brand-200 hover:bg-brand-50/30"
    >
      <div>
        <p className="text-lg font-semibold text-slate-900 sm:text-xl">{task.subject}</p>
        <p className="text-slate-500">{task.title}</p>
        {groupName ? <p className="text-sm text-slate-400">{groupName}</p> : null}
      </div>
      <div className="text-right">
        <p className="text-xl font-bold text-brand-600 sm:text-2xl">{humanDueLabel(task.due_date).replace("Em ", "")}</p>
        <p className="text-sm text-slate-400">{formatDate(task.due_date)}</p>
      </div>
    </button>
  );
}

function SummaryCard({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`rounded-[28px] p-5 sm:p-6 ${className}`}>
      <p className="text-4xl font-bold sm:text-5xl">{value}</p>
      <p className="mt-2 text-xl sm:text-2xl">{label}</p>
    </div>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-500 ${compact ? "px-4 py-3 text-sm" : "px-5 py-10"}`}>{text}</div>;
}

function MembersPanel({ members, showEmails = false }: { members: WorkspaceMember[]; showEmails?: boolean }) {
  return (
    <Panel title="Membros">
      <div className="space-y-3">
        {members.length ? (
          members.map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">{member.profile?.full_name || member.profile?.email || member.user_id}</p>
                {showEmails && member.profile?.email ? <p className="text-sm text-slate-500">{member.profile.email}</p> : null}
              </div>
              <span className="rounded-xl bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{formatRole(member.role)}</span>
            </div>
          ))
        ) : (
          <EmptyState text="Nenhum membro encontrado." compact />
        )}
      </div>
    </Panel>
  );
}

function GroupsPanel({
  groups,
  groupName,
  setGroupName,
  groupDescription,
  setGroupDescription,
  onSubmit,
  saving,
  deletingGroupId,
  onDelete,
}: {
  groups: WorkspaceGroup[];
  groupName: string;
  setGroupName: (value: string) => void;
  groupDescription: string;
  setGroupDescription: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> | void;
  saving: boolean;
  deletingGroupId: string | null;
  onDelete: (group: WorkspaceGroup) => Promise<void> | void;
}) {
  return (
    <Panel title="Grupos internos">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="h-12 rounded-2xl border border-slate-200 px-4"
          placeholder="Nome do grupo"
        />
        <textarea
          value={groupDescription}
          onChange={(e) => setGroupDescription(e.target.value)}
          className="min-h-[96px] rounded-2xl border border-slate-200 px-4 py-3"
          placeholder="Descrição opcional"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-brand-600 px-5 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "Salvando..." : "Criar grupo"}
          </button>
        </div>
      </form>

      <div className="mt-5 space-y-3">
        {groups.length ? (
          groups.map((group) => (
            <div key={group.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-4">
              <div>
                <p className="font-semibold text-slate-900">{group.name}</p>
                {group.description ? <p className="mt-1 text-sm text-slate-500">{group.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => void onDelete(group)}
                disabled={deletingGroupId === group.id}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        ) : (
          <EmptyState text="Nenhum grupo criado." compact />
        )}
      </div>
    </Panel>
  );
}

function TaskCard({
  task,
  groupName,
  onToggleChecklist,
  onEdit,
}: {
  task: Task;
  groupName: string | null;
  onToggleChecklist: (task: Task, item: ChecklistItem) => Promise<void> | void;
  onEdit: () => void;
}) {
  const progress = calculateProgress(task.checklist_items);

  return (
    <section className="rounded-[30px] bg-white p-5 shadow-panel sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <span className={`rounded-xl border px-3 py-1 text-sm font-medium ${mapPriority(task.priority)}`}>{task.priority}</span>
            <span className={`rounded-xl border px-3 py-1 text-sm font-medium ${mapUrgency(task.due_date)}`}>{humanDueLabel(task.due_date)}</span>
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">{statusLabel(task.status)}</span>
            {groupName ? <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">{groupName}</span> : null}
          </div>
          <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">{task.title}</h3>
          <p className="mt-1 text-slate-500">{task.subject} • {typeLabel(task.task_type)}</p>
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
        {task.checklist_items.length ? (
          task.checklist_items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void onToggleChecklist(task, item)}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <span className={`${item.is_done ? "text-slate-400 line-through" : "text-slate-700"}`}>{item.content}</span>
              <CheckCircle2 className={`h-5 w-5 ${item.is_done ? "text-emerald-500" : "text-slate-300"}`} />
            </button>
          ))
        ) : (
          <EmptyState text="Sem checklist." compact />
        )}
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
