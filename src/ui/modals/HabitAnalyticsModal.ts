import { App, Modal } from "obsidian";
import Chart from "chart.js/auto";
import { Habit, HabitEntries } from "../../core/types";
import { HabitStorage } from "../../core/storage";
import { t, getWeekdays } from "../../i18n";
import {
	getStreakInfoForHabit,
	getOverallScoreForHabit,
	getWeekdayStatsForHabit,
	buildScoreSeries,
	buildHistorySeries,
	WeekdayKey,
	getMoodDistribution,
	getAverageEnergy
} from "../../core/analytics";

interface AnalyticsProps {
	storage: HabitStorage;
	habit: Habit;
}

type TimeRange = "week" | "month" | "year" | "all";

export class HabitAnalyticsModal extends Modal {
	private storage: HabitStorage;
	private habit: Habit;
	private charts: Chart[] = [];
	private currentRange: TimeRange = "month";

	constructor(app: App, props: AnalyticsProps) {
		super(app);
		this.storage = props.storage;
		this.habit = props.habit;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("habit-analytics-modal");

        const settings = this.storage.getData().settingsSnapshot;
        const lang = settings.language;

		// PRE-LOAD DATA
		const entries = await this.storage.getEntries(this.habit.id);

		const overall = await getOverallScoreForHabit(this.storage, this.habit.id);
		const streak = await getStreakInfoForHabit(this.storage, this.habit.id);

		// --- HEADER ---
		const header = contentEl.createDiv("ham-header");
		header.style.borderBottom = `2px solid ${this.habit.color}`;

		const titleRow = header.createDiv("ham-title-row");
		titleRow.createEl("h2", { text: this.habit.name });

		// Selector de Rango
		const rangeControls = header.createDiv("ham-range-controls");
		this.createRangeBtn(rangeControls, "week", "7D", lang);
		this.createRangeBtn(rangeControls, "month", "30D", lang);
		this.createRangeBtn(rangeControls, "year", "1A", lang);
		this.createRangeBtn(rangeControls, "all", lang === "es" ? "TODO" : "ALL", lang);

		// --- METRICS GRID ---
		const grid = contentEl.createDiv("ham-summary-grid");
		const addCard = (ti: string, v: string, s: string) => {
			const c = grid.createDiv("ham-card");
			c.createDiv("ham-card-title").setText(ti);
			const val = c.createDiv("ham-card-value");
			val.setText(v);
			val.style.color = this.habit.color;
			c.createDiv("ham-card-sub").setText(s);
		};

		addCard(t("score", lang), `${overall.percent}%`, `${overall.ok}/${overall.total} ${t("days", lang)}`);
		addCard(t("streak", lang), `${streak.currentStreak}`, `${t("max", lang)}: ${streak.bestStreak}`);

		// --- CONTENEDOR DE GRÁFICOS DINÁMICO ---
		const chartsWrapper = contentEl.createDiv("ham-charts-wrapper");
		await this.renderCharts(chartsWrapper, entries, lang);

		// --- WEEKLY TABLE ---
		contentEl.createDiv("ham-section-title").setText(t("weekly-pattern", lang));
		const stats = await getWeekdayStatsForHabit(this.storage, this.habit.id);
		const table = contentEl.createEl("table", { cls: "ham-weekday-table" });
		const days: WeekdayKey[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // Corregido orden para match con getWeekdays
		const localizedWeekdays = getWeekdays(lang);

		days.forEach((d, idx) => {
            // Re-order to Mon-Sun if preferred, but let's keep it simple for now or match localized order
			const row = table.createEl("tr");
			row.createEl("td", { text: localizedWeekdays[idx] });
			const barCell = row.createEl("td");
			const bg = barCell.createDiv("ham-progress-bg");
			
			const fill = bg.createDiv("ham-progress-fill");
			fill.style.background = this.habit.color;
			fill.style.width = `${stats[d].percent}%`;

			row.createEl("td", { text: `${stats[d].percent}%` }).style.textAlign = "right";
		});
	}

	private createRangeBtn(container: HTMLElement, range: TimeRange, label: string, lang: any) {
		const btn = container.createEl("button", { cls: "ham-range-btn", text: label });
		if (this.currentRange === range) btn.addClass("is-active");

		btn.onclick = async () => {
			this.currentRange = range;
			container.querySelectorAll(".ham-range-btn").forEach(b => b.removeClass("is-active"));
			btn.addClass("is-active");
			const wrapper = this.contentEl.querySelector(".ham-charts-wrapper") as HTMLElement;
			if (wrapper) {
				wrapper.empty();
				const entries = await this.storage.getEntries(this.habit.id);
				await this.renderCharts(wrapper, entries, lang);
			}
		};
	}

	private async renderCharts(container: HTMLElement, entries: HabitEntries, lang: any) {
		const avgEnergy = getAverageEnergy(this.habit, entries, this.currentRange);

		// --- 1. Bloque Contexto (Energía y Ánimo) ---
		container.createDiv("ham-section-title").setText(t("context-header", lang));
		const contextGrid = container.createDiv("ham-summary-grid");

		// Tarjeta Energía
		const energyCard = contextGrid.createDiv("ham-card");
		energyCard.createDiv("ham-card-title").setText(t("avg-energy", lang));
		const enVal = energyCard.createDiv("ham-card-value");
		enVal.setText(avgEnergy === "-" ? "-" : `${avgEnergy}/5`);
		enVal.style.color = "#F9A825";
		energyCard.createDiv("ham-card-sub").setText(t("on-completed-days", lang));

		// Tarjeta Gráfico Mood (Donut)
		const moodCard = contextGrid.createDiv("ham-card");
		moodCard.style.position = "relative";
		moodCard.style.height = "220px";
		moodCard.style.display = "flex";
		moodCard.style.alignItems = "center";
		moodCard.style.justifyContent = "center";

		const moodCanvas = moodCard.createEl("canvas");

		// --- 2. Gráficos Principales ---
		container.createDiv("ham-section-title").setText(t("trend", lang));
		const scoreContainer = container.createDiv("ham-chart-container");
		scoreContainer.style.height = "200px";
		scoreContainer.style.position = "relative";
		const scoreCanvas = scoreContainer.createEl("canvas");

		container.createDiv("ham-section-title").setText(t("history", lang));
		const histContainer = container.createDiv("ham-chart-container");
		histContainer.style.height = "200px";
		histContainer.style.position = "relative";
		const histCanvas = histContainer.createEl("canvas");

		requestAnimationFrame(async () => {
			this.charts.forEach(c => c.destroy());
			this.charts = [];

			// --- CHART 0: MOOD (DONUT) ---
			const moodData = await getMoodDistribution(this.habit, entries, this.currentRange);
			const ctxMood = moodCanvas.getContext("2d");
			if (ctxMood && moodData.data.length > 0) {
				const moodColors: Record<string, string> = {
					"😫": "#ef5350",
					"😔": "#ffa726",
					"😑": "#bdbdbd",
					"🙂": "#66bb6a",
					"🔥": "#ffca28"
				};

				const bgColors = moodData.labels.map(l => moodColors[l] || "#999");

				this.charts.push(new Chart(ctxMood, {
					type: 'doughnut',
					data: {
						labels: moodData.labels.map(l => t(`mood-${l}` as any, lang)),
						datasets: [{
							data: moodData.data,
							backgroundColor: bgColors,
							borderWidth: 0,
							hoverOffset: 4
						}]
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						plugins: {
							legend: { 
								position: 'bottom', 
								labels: { 
									boxWidth: 12, 
									font: { size: 12 },
									padding: 8
								} 
							}
						},
						layout: { padding: { left: 10, right: 10, top: 8, bottom: 0 } }
					}
				}));
			} else if (moodData.data.length === 0) {
				moodCard.empty();
				moodCard.createDiv({ text: t("no-mood-data", lang), cls: "ht-empty", attr: { style: "font-size: 0.8em;" } });
			}

			// --- CHART 1: LINE SCORE ---
			const scoreData = buildScoreSeries(this.habit, entries, this.currentRange);
			const ctxScore = scoreCanvas.getContext("2d");
			if (ctxScore) {
				const grad = ctxScore.createLinearGradient(0, 0, 0, 200);
				grad.addColorStop(0, this.habit.color);
				grad.addColorStop(1, "rgba(0,0,0,0)");

				this.charts.push(new Chart(ctxScore, {
					type: "line",
					data: {
						labels: scoreData.labels,
						datasets: [{
							label: t("score", lang),
							data: scoreData.values,
                            spanGaps: true,
							borderColor: this.habit.color,
							backgroundColor: grad,
							fill: true,
							tension: 0.3,
							pointRadius: 3,
							pointBackgroundColor: "var(--background-primary)",
							pointBorderColor: this.habit.color,
							pointBorderWidth: 2
						}]
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						interaction: { intersect: false, mode: 'index' },
						scales: {
							x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
							y: { display: false, min: 0, max: 105 }
						},
						plugins: { legend: { display: false } }
					}
				}));
			}

			// --- CHART 2: BAR HISTORY ---
			const histData = buildHistorySeries(this.habit, entries, this.currentRange, lang);
			const ctxHist = histCanvas.getContext("2d");
			if (ctxHist) {
				this.charts.push(new Chart(ctxHist, {
					type: "bar",
					data: {
						labels: histData.labels,
						datasets: [{
							label: t("value", lang),
							data: histData.values,
							backgroundColor: this.habit.color,
							borderRadius: 3
						}]
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						scales: {
							x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
							y: { grid: { color: "var(--background-modifier-border)" }, beginAtZero: true }
						},
						plugins: { legend: { display: false } }
					}
				}));
			}
		});
	}

	onClose() {
		this.charts.forEach(c => c.destroy());
		this.contentEl.empty();
	}
}