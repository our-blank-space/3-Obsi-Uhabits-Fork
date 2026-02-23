import { App, TFile, normalizePath } from "obsidian";
import { HabitStorage } from "../core/storage";
import { ensureFolder } from "./notes";

export async function exportJsonBackup(app: App, storage: HabitStorage): Promise<string> {
	const d = storage.getData();
	const folder = await ensureFolder(app, d.settingsSnapshot.backupFolder);

	// Agregamos entries a los metadatos para el backup completo
	const habitsWithEntries = [];
	for (const h of d.habits) {
		const entries = await storage.getEntries(h.id);
		habitsWithEntries.push({ ...h, entries: entries.entries });
	}

	const backupData = {
		...d,
		habits: habitsWithEntries
	};

	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const filename = `habit-backup-${stamp}.json`;
	const path = normalizePath(`${folder}/${filename}`);
	const json = JSON.stringify(backupData, null, 2);
	await app.vault.create(path, json);
	return path;
}

export async function importJsonBackup(app: App, storage: HabitStorage, path: string) {
	const normalized = normalizePath(path.trim());
	const file = app.vault.getAbstractFileByPath(normalized);
	if (!(file instanceof TFile)) throw new Error("Archivo no encontrado.");
	const content = await app.vault.read(file);
	const raw = JSON.parse(content);

	// storage.importFromRaw ya maneja la migración/distribución modular si detecta versión < 2
	// Pero aquí recibimos un JSON que ya podría ser v2 agregada.
	// Vamos a forzar que storage.importFromRaw lo procese.
	await storage.importFromRaw(raw);
}

export async function exportCsv(app: App, storage: HabitStorage): Promise<string> {
	const d = storage.getData();
	const folder = await ensureFolder(app, d.settingsSnapshot.backupFolder);
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const filename = `habit-logs-${stamp}.csv`;
	const path = normalizePath(`${folder}/${filename}`);

	const lines: string[] = [];
	lines.push("habitId,habitName,date,type,value,notePath");

	for (const h of d.habits) {
		const entriesData = await storage.getEntries(h.id);
		for (const date of Object.keys(entriesData.entries)) {
			const e = entriesData.entries[date];
			let v = "";
			if (typeof e.value === "number") v = String(e.value);
			else v = e.value;
			const note = e.notePath ?? "";
			lines.push(`"${h.id}","${h.name.replace(/"/g, '""')}",${date},${h.type},${v},"${note.replace(/"/g, '""')}"`);
		}
	}
	await app.vault.create(path, lines.join("\n"));
	return path;
}

export async function repairDatabase(storage: HabitStorage) {
	await storage.repairData();
}