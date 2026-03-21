"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, FileUp, ListChecks, Save, Trash2, Users, X } from "lucide-react";
import type { TaskFormValues, WorkspaceGroup } from "@/lib/types";

const initialValues: TaskFormValues = {
  title: "",
  description: "",
  subject: "",
  taskType: "trabalho",
  dueDate: "",
  priority: "media",
  status: "pendente",
  checklistRaw: "",
  groupId: "",
  file: null,
};

type TaskFormProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: TaskFormValues) => Promise<void> | void;
  submitting: boolean;
  initialValues?: TaskFormValues | null;
  mode?: "create" | "edit";
  onDelete?: (() => Promise<void> | void) | null;
  deleting?: boolean;
  groups?: WorkspaceGroup[];
};

export function TaskForm({
  open,
  onClose,
  onSubmit,
  submitting,
  initialValues: initialValuesProp,
  mode = "create",
  onDelete,
  deleting = false,
  groups = [],
}: TaskFormProps) {
  const [values, setValues] = useState<TaskFormValues>(initialValues);

  const mergedInitialValues = useMemo(
    () => ({
      ...initialValues,
      ...(initialValuesProp ?? {}),
    }),
    [initialValuesProp]
  );

  useEffect(() => {
    if (open) {
      setValues(mergedInitialValues);
    } else {
      setValues(initialValues);
    }
  }, [open, mergedInitialValues]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm">
      <div className="flex min-h-full items-end justify-center p-3 sm:items-center sm:p-4">
        <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                {mode === "edit" ? "Editar tarefa" : "Nova tarefa"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            className="scrollbar-soft overflow-y-auto p-4 sm:p-6"
            onSubmit={async (event) => {
              event.preventDefault();
              await onSubmit(values);
            }}
          >
            <div className="grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Título</span>
                  <input
                    required
                    value={values.title}
                    onChange={(e) => setValues((prev) => ({ ...prev, title: e.target.value }))}
                    className="h-12 rounded-2xl border border-slate-200 px-4"
                    placeholder="Ex.: Trabalho de Ciências"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Matéria</span>
                  <input
                    required
                    value={values.subject}
                    onChange={(e) => setValues((prev) => ({ ...prev, subject: e.target.value }))}
                    className="h-12 rounded-2xl border border-slate-200 px-4"
                    placeholder="Ex.: Ciências"
                  />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Descrição</span>
                <textarea
                  value={values.description}
                  onChange={(e) => setValues((prev) => ({ ...prev, description: e.target.value }))}
                  className="min-h-[110px] rounded-2xl border border-slate-200 px-4 py-3"
                  placeholder="Explique rapidamente o que precisa ser feito"
                />
              </label>

              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Tipo</span>
                  <select
                    value={values.taskType}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, taskType: e.target.value as TaskFormValues["taskType"] }))
                    }
                    className="h-12 rounded-2xl border border-slate-200 px-4"
                  >
                    <option value="prova">Prova</option>
                    <option value="trabalho">Trabalho</option>
                    <option value="atividade">Atividade</option>
                    <option value="apresentacao">Apresentação</option>
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Prioridade</span>
                  <select
                    value={values.priority}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, priority: e.target.value as TaskFormValues["priority"] }))
                    }
                    className="h-12 rounded-2xl border border-slate-200 px-4"
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Média</option>
                    <option value="baixa">Baixa</option>
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Status</span>
                  <select
                    value={values.status}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, status: e.target.value as TaskFormValues["status"] }))
                    }
                    className="h-12 rounded-2xl border border-slate-200 px-4"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="em_andamento">Em andamento</option>
                    <option value="concluida">Concluída</option>
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Prazo</span>
                  <div className="relative">
                    <input
                      required
                      type="date"
                      value={values.dueDate}
                      onChange={(e) => setValues((prev) => ({ ...prev, dueDate: e.target.value }))}
                      className="h-12 w-full rounded-2xl border border-slate-200 px-4 pr-11"
                    />
                    <CalendarDays className="pointer-events-none absolute right-4 top-3.5 h-5 w-5 text-slate-400" />
                  </div>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Grupo</span>
                  <div className="relative">
                    <select
                      value={values.groupId}
                      onChange={(e) => setValues((prev) => ({ ...prev, groupId: e.target.value }))}
                      className="h-12 w-full rounded-2xl border border-slate-200 px-4 pr-11"
                    >
                      <option value="">Sem grupo</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <Users className="pointer-events-none absolute right-4 top-3.5 h-5 w-5 text-slate-400" />
                  </div>
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Checklist</span>
                <div className="relative">
                  <textarea
                    value={values.checklistRaw}
                    onChange={(e) => setValues((prev) => ({ ...prev, checklistRaw: e.target.value }))}
                    className="min-h-[120px] rounded-2xl border border-slate-200 px-4 py-3 pl-12"
                    placeholder={"Digite um item por linha\nPesquisar tema\nMontar slides\nEnsaiar apresentação"}
                  />
                  <ListChecks className="pointer-events-none absolute left-4 top-4 h-5 w-5 text-slate-400" />
                </div>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Anexo</span>
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3 text-slate-600">
                      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                        <FileUp className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">Selecionar arquivo</p>
                        <p className="text-sm text-slate-500">Opcional</p>
                      </div>
                    </div>
                    <input
                      type="file"
                      onChange={(e) => setValues((prev) => ({ ...prev, file: e.target.files?.[0] ?? null }))}
                      className="block w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
                    />
                  </div>
                </div>
              </label>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
              <div>
                {mode === "edit" && onDelete ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await onDelete();
                    }}
                    disabled={deleting || submitting}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-red-200 px-5 font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleting ? "Excluindo..." : "Excluir"}
                  </button>
                ) : null}
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 px-5 font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || deleting}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Save className="h-4 w-4" />
                  {submitting ? "Salvando..." : mode === "edit" ? "Salvar alterações" : "Salvar tarefa"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
