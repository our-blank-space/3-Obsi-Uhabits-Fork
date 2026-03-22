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
	
	let raw;
	try {
		raw = JSON.parse(content);
	} catch (e) {
		throw new Error("El archivo no es un JSON válido.");
	}

	// Defensive Structure Validation
	if (!raw || typeof raw !== 'object') {
		throw new Error("El JSON importado no tiene una estructura de objeto válida.");
	}
	
	if (!Array.isArray(raw.habits)) {
		throw new Error("Imported JSON does not contain a habits list (missing or invalid 'habits' property).");
	}

	// storage.importFromRaw already handles modular migration/distribution if it detects version < 2
	// But here we receive a JSON that might already be v2 added.
	// We will force storage.importFromRaw to process it.
	await storage.importFromRaw(raw);
}

export async function exportCsv(app: App, storage: HabitStorage): Promise<string> {
	const d = storage.getData();
	const folder = await ensureFolder(app, d.settingsSnapshot.backupFolder);
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const filename = `habit-logs-${stamp}.csv`;
	const path = normalizePath(`${folder}/${filename}`);

	const lines: string[] = [];
	lines.push("habitId,habitName,date,type,value,mood,energy,notePath");

	for (const h of d.habits) {
		const entriesData = await storage.getEntries(h.id);
		for (const date of Object.keys(entriesData.entries)) {
			const e = entriesData.entries[date];
			
			// Handle value
			let v = "";
			if (typeof e.value === "number") v = String(e.value);
			else v = e.value;
			
			// Handle optional fields
			const mood = e.mood ?? "";
			const energy = e.energy ?? "";
			const note = e.notePath ?? "";
			
			// Escape texts for CSV
			const safeName = h.name.replace(/"/g, '""');
			const safeNote = note.replace(/"/g, '""');

			lines.push(`"${h.id}","${safeName}",${date},${h.type},${v},${mood},${energy},"${safeNote}"`);
		}
	}
	await app.vault.create(path, lines.join("\n"));
	return path;
}

export async function repairDatabase(storage: HabitStorage) {
	await storage.repairData();
}