import { App, Modal } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { Habit } from "../../core/types";
import {
	getStreakInfoForHabit,
	getOverallScoreForHabit,
	getWeekdayStatsForHabit,
	HabitDateRange,
	WeekdayKey
} from "../../core/analytics";

interface HabitDetailModalOptions {
	storage: HabitStorage;
	habit: Habit;
}

export class HabitDetailModal extends Modal {
	private storage: HabitStorage;
	private habit: Habit;

	constructor(app: App, opts: HabitDetailModalOptions) {
		super(app);
		this.storage = opts.storage;
		this.habit = opts.habit;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("habit-entry-modal");

		const title = contentEl.createEl("h2", { text: this.habit.name });
		title.style.marginBottom = "8px";

		// PRE-LOAD all needed data in parallel
		const [overall, streak, weekdayStats] = await Promise.all([
			getOverallScoreForHabit(this.storage, this.habit.id),
			getStreakInfoForHabit(this.storage, this.habit.id),
			getWeekdayStatsForHabit(this.storage, this.habit.id)
		]);

		// Date range from entries
		const entries = await this.storage.getEntries(this.habit.id);
		const dates = Object.keys(entries.entries).sort();
		const rangeText = dates.length > 0
			? `${dates[0]} → ${dates[dates.length - 1]}`
			: "Sin registros aún";

		contentEl.createEl("div", { cls: "hem-date", text: `Rango: ${rangeText}` });

		// Score summary
		const summarySection = contentEl.createEl("div", { cls: "hem-field" });
		summarySection.createEl("div", { cls: "hem-label", text: "Resumen" });
		const summaryText = summarySection.createEl("div");
		summaryText.style.fontSize = "0.85rem";

		if (overall.total === 0) {
			summaryText.setText("Aún no hay suficientes datos para calcular un score.");
		} else {
			summaryText.setText(`Días OK: ${overall.ok} / ${overall.total}  (${overall.percent}%)`);
		}

		// Streaks
		const streakSection = contentEl.createEl("div", { cls: "hem-field" });
		streakSection.createEl("div", { cls: "hem-label", text: "Rachas" });
		const streakList = streakSection.createEl("ul");
		streakList.style.margin = "0";
		streakList.style.paddingLeft = "1.2rem";
		streakList.style.fontSize = "0.85rem";

		streakList.createEl("li").setText(`Racha actual: ${streak.currentStreak} día(s)`);
		streakList.createEl("li").setText(`Mejor racha histórica: ${streak.bestStreak} día(s)`);
		if (streak.lastDate) {
			streakList.createEl("li").setText(`Último día con registro: ${streak.lastDate}`);
		}

		// Weekday distribution table
		const weekdaySection = contentEl.createEl("div", { cls: "hem-field" });
		weekdaySection.createEl("div", { cls: "hem-label", text: "Distribución por día de la semana" });

		const table = weekdaySection.createEl("table");
		table.style.width = "100%";
		table.style.borderCollapse = "collapse";
		table.style.fontSize = "0.8rem";

		const thead = table.createEl("thead");
		const headRow = thead.createEl("tr");
		for (const h of ["Día", "OK / Total", "% OK"]) {
			const th = headRow.createEl("th", { text: h });
			th.style.textAlign = "left";
			th.style.padding = "2px 4px";
			th.style.borderBottom = "1px solid var(--background-modifier-border)";
		}

		const tbody = table.createEl("tbody");
		const order: WeekdayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
		const labels: Record<WeekdayKey, string> = {
			Mon: "Lun", Tue: "Mar", Wed: "Mié", Thu: "Jue", Fri: "Vie", Sat: "Sáb", Sun: "Dom"
		};

		for (const key of order) {
			const stats = weekdayStats[key];
			const row = tbody.createEl("tr");
			const cDay = row.createEl("td", { text: labels[key] });
			cDay.style.padding = "2px 4px";
			const cRatio = row.createEl("td", { text: `${stats.ok} / ${stats.total}` });
			cRatio.style.padding = "2px 4px";
			const cPercent = row.createEl("td", { text: `${stats.percent}%` });
			cPercent.style.padding = "2px 4px";
		}

		// Footer
		const footer = contentEl.createEl("div", { cls: "hem-actions" });
		const closeBtn = footer.createEl("button", { cls: "ht-btn-secondary", text: "Cerrar" });
		closeBtn.addEventListener("click", () => this.close());
	}
}