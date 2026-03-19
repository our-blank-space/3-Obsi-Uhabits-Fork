export function todayString(): string {
	const d = new Date();
	// Usar local time
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function toDateOnly(dateStr: string): Date {
	// CORRECCIÓN IMPORTANTE: 
	// Evitamos new Date("2023-01-20") porque asume UTC y resta horas según timezone.
	// Creamos la fecha usando los componentes numéricos locales.
	const [y, m, d] = dateStr.split("-").map((x) => Number(x));
	// Ojo: el mes en constructor es 0-indexado.
	return new Date(y, m - 1, d, 12, 0, 0); // Mediodía para seguridad
}

export function addDays(dateStr: string, offset: number): string {
	const d = toDateOnly(dateStr);
	d.setDate(d.getDate() + offset); // Usamos setDate local, no setUTCDate
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function compareDateStr(a: string, b: string): number {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

export function weekdayShort(dateStr: string, firstDayOfWeek: "Mon" | "Sun" = "Mon"): string {
	const d = toDateOnly(dateStr);
	const day = d.getDay(); // getDay local (0=Sun, 1=Mon...)
	const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	return names[day];
}

export function weekdaySpanish(dateStr: string): string {
	const d = toDateOnly(dateStr);
	const day = d.getDay();
	const names = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
	return names[day];
}

export function getISOWeek(dateStr: string): number {
	const date = toDateOnly(dateStr);
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function getISOYear(dateStr: string): number {
	const date = toDateOnly(dateStr);
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	return d.getUTCFullYear();
}

export function getRangeBounds(mode: "week" | "month" | "year" | "all"): { from: string; to: string } {
	const today = todayString();
	let from = today;

	if (mode === "week") {
		from = addDays(today, -6);
	} else if (mode === "month") {
		from = addDays(today, -29);
	} else if (mode === "year") {
		from = addDays(today, -364);
	} else {
		// "all" - usamos una fecha muy antigua como fallback, 
		// aunque lo ideal es que el llamador maneje el undefined si quiere TODO.
		// Pero para mantener compatibilidad con LineSeries:
		from = "2000-01-01"; 
	}

	return { from, to: today };
}