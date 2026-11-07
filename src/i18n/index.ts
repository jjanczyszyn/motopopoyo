// Lightweight i18n. Two locales — English (default) and Spanish.
// Auto-detects from navigator.language on first visit, then remembers the
// user's choice in localStorage so a manual flag swap sticks.

export type Locale = "en" | "es";

const STORAGE_KEY = "kj-locale";

export function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "es") return stored;
  const lang = (window.navigator.language ?? "en").toLowerCase();
  return lang.startsWith("es") ? "es" : "en";
}

export function persistLocale(locale: Locale) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, locale);
  }
}

type Dict = Record<string, string>;

// Spanish wording is Latin-American (Nicaraguan-friendly). Anything that's a
// proper noun, brand, or trademark stays in English.
const en: Dict = {
  // Common
  "common.step": "Step {n} of {total}",
  "common.continue": "Continue",
  "common.day": "day",
  "common.days": "days",

  // Home
  "home.tagline": "Moto Rental · Popoyo",
  "home.whatsapp": "WhatsApp",
  "home.findUs": "Find us",
  "home.feature.surfRack": "Surf rack",
  "home.feature.helmets": "2 helmets",
  "home.feature.delivery": "Doorstep delivery",
  "home.perDay": "/day",
  "home.perWeek": "/week",
  "home.perMonth": "/month",
  "home.rentCta": "Rent a motorcycle",
  "home.reviews": "Reviews",
  "home.reviewsSource": "via Google reviews",

  // Calendar
  "calendar.title": "When do you need it?",
  "calendar.pickup": "Pick-up",
  "calendar.dropoff": "Drop-off",
  "calendar.selectDates": "Select your dates",
  "calendar.est": "est.",

  // BikePick
  "bike.title": "Choose your moto",
  "bike.appliedMonthly": "monthly rate applied",
  "bike.appliedWeekly": "weekly rate applied",
  "bike.appliedDaily": "daily rate",
  "bike.totalSuffix": "total",
  "bike.bookedDates": "Booked for these dates",
  "bike.includes": "Includes surf rack, two helmets and delivery",

  // OCR
  "ocr.title": "Verify your ID",
  "ocr.intro": "Upload a photo of your driver's license or passport. We'll fill in your details automatically.",
  "ocr.uploadCta": "Upload document photo",
  "ocr.uploadHint": "JPG, PNG or HEIC · max 8 MB",
  "ocr.scanning": "SCANNING…",
  "ocr.reading": "Reading your document",
  "ocr.readingHint": "This can take ~30 seconds the first time",
  "ocr.manualHint": "We couldn't read your document automatically. Please fill in the fields below — we'll double-check at delivery.",
  "ocr.firstName": "First name",
  "ocr.lastName": "Last name(s)",
  "ocr.docNumber": "Document number",
  "ocr.extracted": "Extracted from your document",
  "ocr.rescan": "Re-scan document",

  // Phone
  "phone.title": "Your WhatsApp number",
  "phone.intro": "We'll send your contract, delivery details and roadside support over WhatsApp.",
  "phone.code": "Code",
  "phone.number": "Phone number",
  "phone.searchPlaceholder": "Search code or country",
  "phone.noMatch": "No match",
  "phone.sendingTo": "Sending to",
  "phone.invalidTitle": "That number doesn't look valid",
  "phone.invalidBody": "We couldn't validate this number for {cc}. If you're sure it's correct, leave a quick note explaining and we'll review it before delivery.",
  "phone.notePlaceholder": "e.g. short business line, alternate WhatsApp on +505 1234",

  // Payment
  "payment.title": "How will you pay?",
  "payment.depositNote": "${deposit} deposit refunded on return.",
  "payment.openMethod": "Open {label} →",

  // Contract
  "contract.title": "Sign the contract",
  "contract.headline": "Rental agreement",
  "contract.brand": "Karen & JJ Moto Rental",
  "contract.row.renter": "Renter",
  "contract.row.document": "Document",
  "contract.row.country": "Country",
  "contract.row.moto": "Moto",
  "contract.row.registration": "Registration",
  "contract.row.pickup": "Pick-up",
  "contract.row.dropoff": "Drop-off",
  "contract.row.duration": "Duration",
  "contract.row.payment": "Payment",
  "contract.row.whatsapp": "WhatsApp",
  "contract.row.deposit": "Refundable deposit",
  "contract.row.total": "Total rental",
  "contract.terms": "Terms & conditions",
  "contract.term.vehicle": "Vehicle. The Owner (Karen & JJ Moto Rental) rents the above motorcycle to the Renter for the dates listed. The motorcycle is delivered with a surf rack, two helmets and roadside assistance during business hours.",
  "contract.term.responsibility": "Renter's responsibility. The Renter accepts the motorcycle in good working condition and agrees to return it in the same condition. The Renter is the sole responsible operator and must hold a valid driver's license.",
  "contract.term.damage": "Damage. The Renter is responsible for any and all damage to the motorcycle, accessories or third-party property occurring during the rental period, regardless of cause or fault. The Renter agrees to compensate the Owner for the full cost of repairs.",
  "contract.term.theft": "Loss or theft. In the event of loss or theft of the motorcycle, helmets, surf rack or keys during the rental period, the Renter agrees to compensate the Owner for the full market replacement value of the motorcycle and any missing accessories, payable within 14 days of the incident.",
  "contract.term.use": "Use. The motorcycle may not be used for illegal activity or operated under the influence of alcohol or drugs.",
  "contract.term.insurance": "Insurance. The motorcycle carries Nicaraguan third-party liability insurance only. Personal injury, medical expenses and damage to the motorcycle itself are not covered.",
  "contract.term.helmets": "Helmets. Helmets must be worn at all times by both rider and passenger.",
  "contract.term.deposit": "Deposit. A refundable deposit of ${deposit} USD is held at delivery and returned in full upon return.",
  "contract.term.late": "Late return. Returns later than the agreed drop-off date will be billed at the applicable daily rate per started day.",
  "contract.term.acceptance": "Acceptance. By signing below, the Renter confirms they have read, understood and agree to all terms.",
  "contract.signature": "Your signature",
  "contract.tab.draw": "Draw",
  "contract.tab.type": "Type",
  "contract.signHere": "Sign here ×",
  "contract.clear": "Clear",
  "contract.typePlaceholder": "Type your full name",
  "contract.typeAcknowledgement": "By typing your name you agree it represents your handwritten signature.",
  "contract.agreeCta": "I agree & continue",

  // Delivery
  "delivery.title": "Delivery time",
  "delivery.intro": "We'll bring the moto to your address on {day}. Pick a time between {start} and {end}.",
  "delivery.addressLabel": "Delivery address",
  "delivery.addressPlaceholder": "Accommodation name, Google Maps pin/link",
  "delivery.pickTime": "Pick a time",
  "delivery.todayNotice": "Earlier slots need at least 2 hours' notice — they're greyed out.",
  "delivery.submitting": "Submitting…",
  "delivery.confirmCta": "Confirm reservation",

  // Done
  "error.bikeTaken": "Sorry, that bike was just booked for some of those days. Please pick other dates or another bike.",
  "error.generic": "Sorry, something went wrong. Please try again, or message Karen on WhatsApp.",
  "done.heading": "You're all set.",
  "done.atDelivery": "At delivery",
  "done.howToPay": "How to pay",
  "done.amount": "Amount: ${total}",
  "done.amountBreakdown": "(${rental} rental + ${deposit} refundable deposit)",
  "done.openMethod": "Open {label} →",
  "done.screenshotNotice": "Once paid, send a screenshot of the payment confirmation to Karen on WhatsApp so she can confirm your reservation.",
  "done.reservationDetails": "Reservation details",
  "done.row.renter": "Renter",
  "done.row.moto": "Moto",
  "done.row.registration": "Registration",
  "done.row.pickup": "Pick-up",
  "done.row.dropoff": "Drop-off",
  "done.row.days": "Days",
  "done.row.address": "Address",
  "done.row.payment": "Payment",
  "done.row.whatsapp": "WhatsApp",
  "done.row.rental": "Rental",
  "done.row.deposit": "Refundable deposit",
  "done.totalToPay": "Total to pay",
  "done.messageKaren": "Message Karen",
  "done.sendScreenshot": "Send screenshot to Karen",
  "done.backHome": "Back to home",
  "done.waMessage": "Hi Karen, I just booked {code}. Delivery on {date} at {hour} to {address}. {extra}Waiting for your confirmation!",
  "done.waMessageExtra": "I'm sending the payment screenshot. ",
};

const es: Dict = {
  "common.step": "Paso {n} de {total}",
  "common.continue": "Continuar",
  "common.day": "día",
  "common.days": "días",

  "home.tagline": "Renta de motos · Popoyo",
  "home.whatsapp": "WhatsApp",
  "home.findUs": "Cómo llegar",
  "home.feature.surfRack": "Portatabla",
  "home.feature.helmets": "2 cascos",
  "home.feature.delivery": "Entrega a domicilio",
  "home.perDay": "/día",
  "home.perWeek": "/semana",
  "home.perMonth": "/mes",
  "home.rentCta": "Rentar una moto",
  "home.reviews": "Reseñas",
  "home.reviewsSource": "vía Google reviews",

  "calendar.title": "¿Cuándo la necesitás?",
  "calendar.pickup": "Entrega",
  "calendar.dropoff": "Devolución",
  "calendar.selectDates": "Elegí tus fechas",
  "calendar.est": "aprox.",

  "bike.title": "Elegí tu moto",
  "bike.appliedMonthly": "tarifa mensual aplicada",
  "bike.appliedWeekly": "tarifa semanal aplicada",
  "bike.appliedDaily": "tarifa diaria",
  "bike.totalSuffix": "total",
  "bike.bookedDates": "Reservada en esas fechas",
  "bike.includes": "Incluye portatabla, dos cascos y entrega",

  "ocr.title": "Verificá tu identidad",
  "ocr.intro": "Subí una foto de tu licencia o pasaporte. Llenamos los datos automáticamente.",
  "ocr.uploadCta": "Subir foto del documento",
  "ocr.uploadHint": "JPG, PNG o HEIC · máx. 8 MB",
  "ocr.scanning": "ESCANEANDO…",
  "ocr.reading": "Leyendo tu documento",
  "ocr.readingHint": "Puede tardar unos 30 segundos la primera vez",
  "ocr.manualHint": "No pudimos leer tu documento automáticamente. Llená los campos abajo — confirmamos en la entrega.",
  "ocr.firstName": "Nombre",
  "ocr.lastName": "Apellido(s)",
  "ocr.docNumber": "Número de documento",
  "ocr.extracted": "Datos extraídos de tu documento",
  "ocr.rescan": "Re-escanear documento",

  "phone.title": "Tu número de WhatsApp",
  "phone.intro": "Te enviamos el contrato, los detalles de entrega y soporte por WhatsApp.",
  "phone.code": "Código",
  "phone.number": "Número de teléfono",
  "phone.searchPlaceholder": "Buscar código o país",
  "phone.noMatch": "Sin resultados",
  "phone.sendingTo": "Enviando a",
  "phone.invalidTitle": "Ese número no parece válido",
  "phone.invalidBody": "No pudimos validar este número para {cc}. Si estás seguro de que es correcto, dejá una nota corta explicando y lo revisamos antes de la entrega.",
  "phone.notePlaceholder": "ej. línea comercial corta, WhatsApp alterno +505 1234",

  "payment.title": "¿Cómo vas a pagar?",
  "payment.depositNote": "Depósito de ${deposit} reembolsable a la devolución.",
  "payment.openMethod": "Abrir {label} →",

  "contract.title": "Firmá el contrato",
  "contract.headline": "Contrato de alquiler",
  "contract.brand": "Karen & JJ Moto Rental",
  "contract.row.renter": "Arrendatario",
  "contract.row.document": "Documento",
  "contract.row.country": "País",
  "contract.row.moto": "Moto",
  "contract.row.registration": "Placa",
  "contract.row.pickup": "Entrega",
  "contract.row.dropoff": "Devolución",
  "contract.row.duration": "Duración",
  "contract.row.payment": "Pago",
  "contract.row.whatsapp": "WhatsApp",
  "contract.row.deposit": "Depósito reembolsable",
  "contract.row.total": "Total del alquiler",
  "contract.terms": "Términos y condiciones",
  "contract.term.vehicle": "Vehículo. El Propietario (Karen & JJ Moto Rental) alquila la motocicleta indicada al Arrendatario por las fechas listadas. La moto se entrega con portatabla, dos cascos y asistencia en ruta en horario comercial.",
  "contract.term.responsibility": "Responsabilidad del Arrendatario. El Arrendatario acepta la moto en buen estado de funcionamiento y se compromete a devolverla en las mismas condiciones. Es el único conductor responsable y debe contar con licencia de conducir vigente.",
  "contract.term.damage": "Daños. El Arrendatario es responsable de todo daño a la moto, accesorios o bienes de terceros ocurrido durante el periodo de alquiler, sin importar la causa ni la culpa. Se compromete a indemnizar al Propietario por el costo total de reparación.",
  "contract.term.theft": "Pérdida o robo. En caso de pérdida o robo de la moto, cascos, portatabla o llaves durante el alquiler, el Arrendatario se compromete a indemnizar al Propietario por el valor total de reposición a precio de mercado de la moto y los accesorios faltantes, pagaderos dentro de 14 días del incidente.",
  "contract.term.use": "Uso. La moto no podrá usarse para actividades ilegales ni operarse bajo los efectos del alcohol o drogas.",
  "contract.term.insurance": "Seguro. La moto cuenta solo con seguro nicaragüense de responsabilidad civil a terceros. Las lesiones personales, gastos médicos y daños a la propia moto no están cubiertos.",
  "contract.term.helmets": "Cascos. Los cascos deben usarse en todo momento, tanto por el conductor como por el pasajero.",
  "contract.term.deposit": "Depósito. Se retiene un depósito reembolsable de ${deposit} USD en la entrega y se devuelve íntegramente al regreso de la moto.",
  "contract.term.late": "Devolución tardía. Las devoluciones posteriores a la fecha pactada se cobrarán a la tarifa diaria correspondiente por cada día iniciado.",
  "contract.term.acceptance": "Aceptación. Al firmar abajo, el Arrendatario confirma que leyó, entendió y acepta todos los términos.",
  "contract.signature": "Tu firma",
  "contract.tab.draw": "Dibujar",
  "contract.tab.type": "Escribir",
  "contract.signHere": "Firmá aquí ×",
  "contract.clear": "Borrar",
  "contract.typePlaceholder": "Escribí tu nombre completo",
  "contract.typeAcknowledgement": "Al escribir tu nombre aceptás que representa tu firma manuscrita.",
  "contract.agreeCta": "Acepto y continúo",

  "delivery.title": "Hora de entrega",
  "delivery.intro": "Llevamos la moto a tu dirección el {day}. Elegí una hora entre las {start} y las {end}.",
  "delivery.addressLabel": "Dirección de entrega",
  "delivery.addressPlaceholder": "Hospedaje, link/pin de Google Maps",
  "delivery.pickTime": "Elegí una hora",
  "delivery.todayNotice": "Las horas tempranas necesitan al menos 2 horas de aviso — están desactivadas.",
  "delivery.submitting": "Enviando…",
  "delivery.confirmCta": "Confirmar reserva",

  "error.bikeTaken": "Lo sentimos, esa moto se acaba de reservar para algunos de esos días. Elige otras fechas u otra moto.",
  "error.generic": "Lo sentimos, algo salió mal. Inténtalo de nuevo o escríbele a Karen por WhatsApp.",
  "done.heading": "¡Listo!",
  "done.atDelivery": "En la entrega",
  "done.howToPay": "Cómo pagar",
  "done.amount": "Monto: ${total}",
  "done.amountBreakdown": "(${rental} alquiler + ${deposit} depósito reembolsable)",
  "done.openMethod": "Abrir {label} →",
  "done.screenshotNotice": "Una vez pagado, enviá una captura del comprobante a Karen por WhatsApp para que confirme tu reserva.",
  "done.reservationDetails": "Detalles de la reserva",
  "done.row.renter": "Arrendatario",
  "done.row.moto": "Moto",
  "done.row.registration": "Placa",
  "done.row.pickup": "Entrega",
  "done.row.dropoff": "Devolución",
  "done.row.days": "Días",
  "done.row.address": "Dirección",
  "done.row.payment": "Pago",
  "done.row.whatsapp": "WhatsApp",
  "done.row.rental": "Alquiler",
  "done.row.deposit": "Depósito reembolsable",
  "done.totalToPay": "Total a pagar",
  "done.messageKaren": "Escribirle a Karen",
  "done.sendScreenshot": "Enviar comprobante a Karen",
  "done.backHome": "Volver al inicio",
  "done.waMessage": "Hola Karen, acabo de reservar {code}. Entrega el {date} a las {hour} en {address}. {extra}¡Esperando tu confirmación!",
  "done.waMessageExtra": "Te envío la captura del pago. ",
};

const dicts: Record<Locale, Dict> = { en, es };

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const raw = dicts[locale][key] ?? dicts.en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined ? `{${k}}` : String(v);
  });
}

// Locale-aware helpers for things that aren't strings — e.g. month/day names.
export function localeForIntl(locale: Locale): string {
  return locale === "es" ? "es-NI" : "en-US";
}
