import { App, TFile, normalizePath } from "obsidian";
import { HabitStorage } from "../core/storage";
import { ensureFolder } from "./notes";
import { todayString, addDays, compareDateStr } from "./dates";
import { evalHabitOnDateWithEntries } from "../core/entries";

export async function generateMonthlyReport(app: App, storage: HabitStorage): Promise<string> {
	const d = storage.getData();
	const folder = await ensureFolder(app, d.settingsSnapshot.reportsFolder);
	const now = new Date();
	const label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

	const filename = `Habit Report ${label}.md`;
	const path = normalizePath(`${folder}/${filename}`);
	let content = `# Habit Report (${label})\n\n`;

	const startOfMonth = `${label}-01`;
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	const endOfMonth = `${label}-${String(lastDay.getDate()).padStart(2, "0")}`;

	for (const h of d.habits) {
		const entriesData = await storage.getEntries(h.id);

		let ok = 0, total = 0;
		for (let day = startOfMonth; compareDateStr(day, endOfMonth) <= 0; day = addDays(day, 1)) {
			if (compareDateStr(day, todayString()) > 0) break;
			const ev = evalHabitOnDateWithEntries(h, day, entriesData);
			if (ev !== "NONE") {
				total++;
				if (ev === "OK") ok++;
			}
		}
		
		const percent = total > 0 ? Math.round((ok / total) * 100) : 0;
		content += `## ${h.name}\n- **Compliance**: ${ok}/${total} (${percent}%)\n`;
		
		// Calculate additional info for the monthly report
		let totalEnergy = 0;
		let energyCount = 0;
		const moodCounts: Record<string, number> = {};
		
		for (const date in entriesData.entries) {
			if (compareDateStr(date, startOfMonth) >= 0 && compareDateStr(date, endOfMonth) <= 0) {
				const e = entriesData.entries[date];
				if (e.energy) {
					totalEnergy += e.energy;
					energyCount++;
				}
				if (e.mood) {
					moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
				}
			}
		}
		
		const avgEnergy = energyCount > 0 ? (totalEnergy / energyCount).toFixed(1) : "N/A";
		const topMood = Object.keys(moodCounts).length > 0 
		    ? Object.keys(moodCounts).reduce((a, b) => moodCounts[a] > moodCounts[b] ? a : b)
			: "N/A";

		content += `- **Average Energy**: ${avgEnergy}\n`;
		content += `- **Frequent Mood**: ${topMood}\n\n`;
	}

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) await app.vault.modify(existing, content);
	else await app.vault.create(path, content);
	return path;
}