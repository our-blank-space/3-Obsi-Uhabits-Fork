import { App, TFile, normalizePath, Notice } from "obsidian";
import { Habit } from "../core/types";
import { weekdaySpanish } from "./dates";

export interface NoteSettings {
	folder: string;
	openAfterCreate: boolean;
	askBeforeCreate: boolean;
	filenamePattern: string;
	template: string;
}

export async function ensureFolder(app: App, folder: string): Promise<string> {
	const path = normalizePath(folder.trim() || "Habit Logs");
	const existing = app.vault.getAbstractFileByPath(path);
	if (!existing) {
		await app.vault.createFolder(path);
	}
	return path;
}

export async function createMonthlyHabitLog(
	app: App,
	folder: string,
	habit: Habit,
	dateStr: string,
	valueText: string,
	mood: string,
	userNotes: string
): Promise<string> {
	const baseFolder = await ensureFolder(app, folder);
	const [year, month] = dateStr.split("-");
	const filename = `Log_Habitos_${year}-${month}.md`;
	const path = normalizePath(`${baseFolder}/${filename}`);

	const dayName = weekdaySpanish(dateStr).slice(0, 3);
	const dateWithDay = `${dateStr} (${dayName})`;

	// Mapeo binario / cuantitativo
	let binaryHabit = "0";
	let quantValue = valueText;

	if (habit.type === "yesno") {
		binaryHabit = valueText === "✔" ? "1" : "0";
		quantValue = binaryHabit;
	} else {
		const num = parseFloat(valueText);
		binaryHabit = num > 0 ? "1" : "0";
		quantValue = String(Math.floor(num));
	}

	// Escapar pipes de Markdown en las observaciones
	const cleanNotes = userNotes.replace(/\n/g, " ").replace(/\|/g, "\\|").trim();
	const newRow = `| ${dateWithDay} | ${habit.name}: ${binaryHabit} | ${quantValue} | ${mood || "-"} | ${cleanNotes} |`;

	const existing = app.vault.getAbstractFileByPath(path);
	let content = "";

	if (existing instanceof TFile) {
		const rawContent = await app.vault.read(existing);
		const lines = rawContent.split("\n");

		// Buscar y actualizar si ya existe una fila para este hábito en esta fecha
		const rowPrefix = `| ${dateWithDay} | ${habit.name}:`;
		let found = false;
		const newLines = lines.map(line => {
			if (line.startsWith(rowPrefix)) {
				found = true;
				return newRow;
			}
			return line;
		});

		if (!found) newLines.push(newRow);
		content = newLines.join("\n");
	} else {
		content = `---
type: 97-Log
tags: [system/habit-log]
month: ${year}-${month}
status: [🟢]
---
| Fecha / Día | Hábito (Cualitativo/Binario) | Valor (Cuantitativo) | Estado de Ánimo | Observaciones |
|---|---|---|---|---|
${newRow}`;
	}

	try {
		if (existing instanceof TFile) {
			await app.vault.modify(existing, content);
		} else {
			await app.vault.create(path, content);
		}
	} catch (e) {
		console.error(e);
		new Notice("Error actualizando Log Mensual.");
		throw e;
	}

	return path;
}

export async function createHabitNote(
	app: App,
	settings: NoteSettings,
	habit: Habit,
	dateStr: string,
	valueText: string,
	userNotes: string,
	mood: string = "🙂"
): Promise<string> {
	return await createMonthlyHabitLog(app, settings.folder, habit, dateStr, valueText, mood, userNotes);
}
