// Copy helpers for the /new quick-add page (simple Spanish for Karen).

/** Server errors (English, meant for the admin) → short, plain Spanish. */
export function spanishError(raw: string): string {
  if (/QUICK_EDIT_CLOSED|24 hours/i.test(raw)) return "Ya pasaron 24 horas. Ya no se puede cambiar. Dile a JJ.";
  if (/already booked/i.test(raw)) return "Esa moto ya está ocupada esos días. Elige otra moto u otro día.";
  if (/out of service/i.test(raw)) return "Esa moto está en el taller esos días. Elige otra.";
  if (/auth|session|sign in/i.test(raw)) return "Tienes que entrar otra vez. Toca Salir y pon tu nombre y clave.";
  return "No se guardó. Intenta otra vez.";
}
