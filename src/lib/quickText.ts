// Copy helpers for the /new quick-add page (simple Spanish for Karen).

/** Server errors (English, meant for the admin) → short, plain Spanish. */
export function spanishError(raw: string): string {
  if (/QUICK_EDIT_CLOSED|24 hours/i.test(raw)) return "Ya pasaron 24 horas. Ya no se puede cambiar. Dile a JJ.";
  if (/SERVICE_NAME/.test(raw)) return "Escribe qué servicio fue.";
  if (/SERVICE_FUTURE/.test(raw)) return "Ese día todavía no llega. Guárdalo cuando ya pasó.";
  if (/SERVICE_DATE/.test(raw)) return "Elige el día.";
  if (/SERVICE_COST_OVER_PRICE/.test(raw)) return "El costo es más que lo que pagó el cliente. Revisa los números.";
  if (/SERVICE_PRICE/.test(raw)) return "Pon cuánto pagó el cliente.";
  if (/SERVICE_COST/.test(raw)) return "Pon cuánto costó el servicio.";
  if (/already booked/i.test(raw)) return "Esa moto ya está ocupada esos días. Elige otra moto u otro día.";
  if (/out of service/i.test(raw)) return "Esa moto está en el taller esos días. Elige otra.";
  if (/auth|session|sign in/i.test(raw)) return "Tienes que entrar otra vez. Toca Salir y pon tu nombre y clave.";
  return "No se guardó. Intenta otra vez.";
}

/** "45,50" or "45.50" → 45.5; blank or not a plain amount → null. */
export function parseMoney(s: string): number | null {
  const t = s.trim().replace(",", ".");
  return /^\d+(\.\d*)?$/.test(t) ? Number(t) : null;
}
