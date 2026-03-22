import { App, TFile, normalizePath, Notice } from "obsidian";
import { Habit } from "../core/types";
import { t, getWeekdays } from "../i18n";

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
	userNotes: string,
    lang: any
): Promise<string> {
	const baseFolder = await ensureFolder(app, folder);
	const [year, month] = dateStr.split("-");
    const filenamePrefix = t("log-filename", lang);
	const filename = `${filenamePrefix}_${year}-${month}.md`;
	const path = normalizePath(`${baseFolder}/${filename}`);

    const dateObj = new Date(dateStr + "T00:00:00");
    const dayOfWeek = dateObj.getDay(); // 0 is Sunday
    const dayNames = getWeekdays(lang);
	const dayName = dayNames[dayOfWeek].slice(0, 3);
	const dateWithDay = `${dateStr} (${dayName})`;

	// Binary / Quantitative mapping
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

	// Escape Markdown pipes in observations
	const cleanNotes = userNotes.replace(/\n/g, " ").replace(/\|/g, "\\|").trim();
	const newRow = `| ${dateWithDay} | ${habit.name}: ${binaryHabit} | ${quantValue} | ${mood || "-"} | ${cleanNotes} |`;

	const existing = app.vault.getAbstractFileByPath(path);
	let content = "";

	if (existing instanceof TFile) {
		const rawContent = await app.vault.read(existing);
		const lines = rawContent.split("\n");

		// Search and update if a row for this habit on this date already exists
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
        const hDate = t("table-header-date", lang);
        const hHabit = t("table-header-habit", lang);
        const hValue = t("table-header-value", lang);
        const hMood = t("table-header-mood", lang);
        const hNotes = t("table-header-notes", lang);
		content = `---
type: habit-log
tags: [system/habit-log]
month: ${year}-${month}
---
| ${hDate} | ${hHabit} | ${hValue} | ${hMood} | ${hNotes} |
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
		new Notice(t("error-updating-log", lang));
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
	mood: string = "🙂",
    lang: any = "auto"
): Promise<string> {
	return await createMonthlyHabitLog(app, settings.folder, habit, dateStr, valueText, mood, userNotes, lang);
}
