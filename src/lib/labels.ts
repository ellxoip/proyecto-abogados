// Centralised display labels and help copy for HIVE CONTROL admin.
// DB enum values stay unchanged; this file only controls what humans see.

export const STAGE_LABEL: Record<string, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En Proceso",
  FINISHED: "Finalizado",
  HALTED_BY_PAYMENT: "Detenido por Mora",
  WAITING_CUOTAS: "Esperando Pago Inicial",
};

export const STAGE_DESCRIPTION: Record<string, string> = {
  OPEN: "Pago inicial validado. Caso listo para asignar al equipo legal.",
  IN_PROGRESS: "Equipo legal asignado y trabajando activamente en el expediente.",
  FINISHED: "Caso resuelto y archivado. Solo lectura.",
  HALTED_BY_PAYMENT: "Caso pausado por mora sostenida del cliente (3+ meses). Requiere regularización.",
  WAITING_CUOTAS: "Caso registrado pero aún sin pago inicial confirmado. Bloqueado para asignación.",
};

export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return "—";
  return STAGE_LABEL[stage] ?? stage;
}

export function stageDescription(stage: string | null | undefined): string {
  if (!stage) return "";
  return STAGE_DESCRIPTION[stage] ?? "";
}

export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "SuperAdmin",
  JEFE_DE_MESA: "Jefe de Grupo",
  ABOGADO: "Abogado",
  CLIENTE: "Cliente",
  SISTEMA_CUOTAS: "Sistema de Cuotas",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABEL[role] ?? role;
}

// Process help — used for tooltip auto-ayudas across admin views.
export const PROCESS_HELP: Record<string, string> = {
  bandeja:
    "Casos nuevos esperando ser revisados, validados y asignados al equipo legal. El SuperAdmin valida el pago inicial y deriva al Jefe de Grupo correspondiente.",
  double_check:
    "Validación dual del pago inicial. Solo el SuperAdmin puede derivar un caso a un Jefe de Grupo, y solo si el pago fue confirmado.",
  asignacion:
    "Una vez derivado, el Jefe de Grupo asigna uno o más abogados al caso. Al asignar el primer abogado, el caso pasa de Abierto a En Proceso.",
  mora:
    "Cuando un cliente acumula cuotas vencidas, el sistema escala: Mes 1 → aviso WhatsApp/Email · Mes 2 → aviso intensificado · Mes 3+ → caso detenido y cuenta del cliente suspendida.",
  reactivacion:
    "Al regularizar el pago, el caso reactiva al estado donde estaba (En Proceso si tenía abogado, o Abierto si no). La cuenta del cliente se reactiva.",
  ingresos_riesgo:
    "Suma total de cuotas vencidas en casos detenidos. Representa el monto que la firma deja de percibir por mora sostenida.",
  esperando_pago:
    "Casos ingresados pero sin pago inicial validado. Permanecen bloqueados hasta que el cliente complete el pago.",
  sin_asignar:
    "Casos con pago validado que aún no tienen abogado asignado. Requieren acción inmediata del Jefe de Grupo.",
  health_sweep:
    "Worker automático que corre cada 15 minutos revisando salud de cada caso activo: aplica reglas de mora, escalamiento y reactivación.",
  metricas:
    "Indicadores agregados de productividad y SLA del equipo legal. Permiten al SuperAdmin tomar decisiones de carga de trabajo.",
  productividad:
    "Horas registradas por cada abogado, distribución por actividad y categoría. Base para evaluar rendimiento individual.",
  sla:
    "Plazos máximos definidos por categoría de caso. El sistema marca como 'En Riesgo' los casos que se acercan al vencimiento.",
};

export function processHelp(key: string): string {
  return PROCESS_HELP[key] ?? "";
}
