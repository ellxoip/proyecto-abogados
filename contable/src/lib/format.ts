import { format } from "date-fns";

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: Date | string) {
  return format(typeof value === "string" ? new Date(value) : value, "dd-MM-yyyy");
}
