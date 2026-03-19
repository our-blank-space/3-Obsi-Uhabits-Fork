import { App, Modal } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { Habit } from "../../core/types";
import {
	getStreakInfoForHabit,
	getOverallScoreForHabit,
	getWeekdayStatsForHabit,
	buildHeatmapData,
	WeekdayKey
} from "../../core/analytics";
import { todayString, addDays } from "../../core/../utils/dates";

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
		contentEl.addClass("habit-modal");
		contentEl.addClass("habit-detail-modal");

		// Header with habit icon & title
		const habitHeader = contentEl.createDiv("ht-detail-header");
		const habitIcon = habitHeader.createDiv("ht-detail-header-icon");
		habitIcon.style.backgroundColor = `${this.habit.color}20`;
		habitIcon.style.color = this.habit.color;
		habitIcon.setText(this.habit.icon || "✨");
		
		const habitTitleBlock = habitHeader.createDiv("ht-detail-header-info");
		habitTitleBlock.createEl("h2", { text: this.habit.name });
		if (this.habit.category) {
			habitTitleBlock.createDiv("ht-detail-category").setText(this.habit.category);
		}

		// PRE-LOAD all needed data in parallel
		const [overall, streak, weekdayStats] = await Promise.all([
			getOverallScoreForHabit(this.storage, this.habit.id),
			getStreakInfoForHabit(this.storage, this.habit.id),
			getWeekdayStatsForHabit(this.storage, this.habit.id)
		]);

		const entries = await this.storage.getEntries(this.habit.id);
		const dates = Object.keys(entries.entries).sort();

		// --- Stats Cards ---
		const statsGrid = contentEl.createDiv("ht-detail-stats-grid");

		const addStatCard = (label: string, value: string, sub: string, color: string) => {
			const card = statsGrid.createDiv("ht-detail-stat-card");
			card.createDiv("ht-detail-stat-label").setText(label.toUpperCase());
			const v = card.createDiv("ht-detail-stat-value");
			v.setText(value);
			v.style.color = color;
			card.createDiv("ht-detail-stat-sub").setText(sub);
		};

		addStatCard("Score", `${overall.percent}%`, `${overall.ok}/${overall.total} días`, this.habit.color);
		addStatCard("Racha Actual", `${streak.currentStreak}`, `Máxima: ${streak.bestStreak}`, "#FF6321");
		
		const firstDate = dates[0] || "—";
		addStatCard("Desde", firstDate, streak.lastDate ? `Último: ${streak.lastDate}` : "Sin fecha", "#6366F1");

		// --- HEATMAP (GitHub Style) ---
		const heatmapSection = contentEl.createDiv("ht-detail-section");
		heatmapSection.createDiv("ht-detail-section-title").setText("Actividad — Últimos 12 Meses");
		
		const heatmapContainer = heatmapSection.createDiv("ht-heatmap-container");
		const heatmapData = buildHeatmapData(this.habit, entries);
		
		const today = todayString();
		const daysToRender = 364;
		
		for (let i = daysToRender; i >= 0; i--) {
			const d = addDays(today, -i);
			const box = heatmapContainer.createDiv("ht-heatmap-box");
			const status = heatmapData[d];
			
			if (status === "OK") {
				box.style.backgroundColor = this.habit.color;
				box.style.opacity = "0.9";
			} else if (status === "NO") {
				box.addClass("is-no");
			}
			box.title = `${d}: ${status || "Sin datos"}`;
		}

		// Leyenda del heatmap
		const legend = heatmapSection.createDiv("ht-heatmap-legend");
		legend.createSpan({ cls: "ht-heatmap-legend-label", text: "Menor" });
		const legendBoxes = legend.createDiv("ht-heatmap-legend-boxes");
		["rgba(255,255,255,0.05)", `${this.habit.color}30`, `${this.habit.color}60`, `${this.habit.color}90`, this.habit.color].forEach(color => {
			const b = legendBoxes.createDiv("ht-heatmap-box");
			b.style.backgroundColor = color;
		});
		legend.createSpan({ cls: "ht-heatmap-legend-label", text: "Mayor" });

		// --- Patrón Semanal ---
		const weekSection = contentEl.createDiv("ht-detail-section");
		weekSection.createDiv("ht-detail-section-title").setText("Patrón Semanal");

		const weekGrid = weekSection.createDiv("ht-weekly-pattern-grid");
		const order: WeekdayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
		const labels: Record<WeekdayKey, string> = {
			Mon: "L", Tue: "M", Wed: "X", Thu: "J", Fri: "V", Sat: "S", Sun: "D"
		};

		const maxPercent = Math.max(...order.map(k => weekdayStats[k].percent), 1);

		order.forEach(key => {
			const stats = weekdayStats[key];
			const col = weekGrid.createDiv("ht-weekday-col");
			
			const barWrap = col.createDiv("ht-weekday-bar-wrap");
			const fill = barWrap.createDiv("ht-weekday-bar-fill");
			fill.style.height = `${(stats.percent / maxPercent) * 100}%`;
			fill.style.backgroundColor = this.habit.color;

			col.createDiv("ht-weekday-label").setText(labels[key]);
		});
	}

	onClose() { this.contentEl.empty(); }
}