export const PROCESSING_PROCESSES = [
  {
    id: "health-sweep",
    name: "Control de salud de casos",
    type: "Programado",
    cadence: "Cada 15 minutos",
    owner: "Sistema",
    purpose: "Revisa casos abiertos, en proceso o esperando cuotas. Aplica reglas de mora, bloqueos y reactivaciones segun el flujo.",
    input: "Casos activos con ultima revision vencida o pendiente.",
    output: "Estado actualizado, auditoria y avisos al cliente cuando corresponde.",
  },
  {
    id: "executioner",
    name: "Pago inicial pendiente",
    type: "Programado",
    cadence: "Cada hora",
    owner: "Sistema",
    purpose: "Detecta ingresos nuevos sin pago inicial confirmado por mas de 24 horas.",
    input: "Casos OPEN con is_paid=false y antiguedad mayor a 24 horas.",
    output: "Caso movido a WAITING_CUOTAS con motivo administrativo.",
  },
  {
    id: "whatsapp",
    name: "Notificaciones WhatsApp",
    type: "Evento",
    cadence: "Cuando ocurre una accion",
    owner: "Meta WhatsApp",
    purpose: "Envia avisos al cliente por actualizaciones, mora, comprobantes, credenciales y cierre.",
    input: "Evento del caso y telefono del cliente.",
    output: "Mensaje enviado o auditoria de omision/fallo.",
  },
  {
    id: "email",
    name: "Notificaciones Email",
    type: "Evento",
    cadence: "Cuando ocurre una accion",
    owner: "Resend",
    purpose: "Envia correos al cliente por actualizaciones, mora, comprobantes, credenciales y cierre.",
    input: "Evento del caso y correo del cliente.",
    output: "Email enviado o auditoria de omision/fallo.",
  },
] as const;

export type ProcessingProcessId = (typeof PROCESSING_PROCESSES)[number]["id"];
