export type PlanCode = "individual_free" | "grupo" | "turma";
export type PlanStatus = "active" | "pending" | "inactive";

export type PlanDefinition = {
  code: PlanCode;
  title: string;
  subtitle: string;
  isFree: boolean;
  workspaceType: "individual" | "grupo" | "turma";
  limits: {
    maxMembers: number;
    maxGroups: number;
    maxActiveTasks: number;
  };
  features: {
    sharedWorkspace: boolean;
    attachments: boolean;
    groups: boolean;
    adminApproval: boolean;
  };
};

export const PLAN_DEFINITIONS: Record<PlanCode, PlanDefinition> = {
  individual_free: {
    code: "individual_free",
    title: "Individual Gratuito",
    subtitle: "Para organização pessoal sem custo.",
    isFree: true,
    workspaceType: "individual",
    limits: {
      maxMembers: 1,
      maxGroups: 0,
      maxActiveTasks: 20,
    },
    features: {
      sharedWorkspace: false,
      attachments: false,
      groups: false,
      adminApproval: false,
    },
  },
  grupo: {
    code: "grupo",
    title: "Grupo",
    subtitle: "Para pequenos grupos com colaboração compartilhada.",
    isFree: false,
    workspaceType: "grupo",
    limits: {
      maxMembers: 10,
      maxGroups: 5,
      maxActiveTasks: 300,
    },
    features: {
      sharedWorkspace: true,
      attachments: true,
      groups: true,
      adminApproval: true,
    },
  },
  turma: {
    code: "turma",
    title: "Turma",
    subtitle: "Para turmas completas com maior capacidade.",
    isFree: false,
    workspaceType: "turma",
    limits: {
      maxMembers: 45,
      maxGroups: 20,
      maxActiveTasks: 1000,
    },
    features: {
      sharedWorkspace: true,
      attachments: true,
      groups: true,
      adminApproval: true,
    },
  },
};

export const PLAN_ORDER: PlanCode[] = ["individual_free", "grupo", "turma"];

export function getPlanDefinition(planCode: PlanCode | null | undefined) {
  if (!planCode) return null;
  return PLAN_DEFINITIONS[planCode];
}
