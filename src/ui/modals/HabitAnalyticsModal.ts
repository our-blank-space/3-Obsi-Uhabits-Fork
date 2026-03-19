import { App, Modal } from "obsidian";
import Chart from "chart.js/auto";
import { Habit, HabitEntries } from "../../core/types";
import { HabitStorage } from "../../core/storage";
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

		// PRE-LOAD DATA
		const entries = await this.storage.getEntries(this.habit.id);

		const overall = await getOverallScoreForHabit(this.storage, this.habit.id);
		const streak = await getStreakInfoForHabit(this.storage, this.habit.id);

		// --- HEADER ---
		const header = contentEl.createDiv("ham-header");
		// Mantenemos solo el color dinámico del hábito
		header.style.borderBottom = `2px solid ${this.habit.color}`;

		const titleRow = header.createDiv("ham-title-row");
		titleRow.createEl("h2", { text: this.habit.name });

		// Selector de Rango
		const rangeControls = header.createDiv("ham-range-controls");
		this.createRangeBtn(rangeControls, "week", "7D");
		this.createRangeBtn(rangeControls, "month", "30D");
		this.createRangeBtn(rangeControls, "year", "1A");
		this.createRangeBtn(rangeControls, "all", "TODO");

		// --- METRICS GRID ---
		const grid = contentEl.createDiv("ham-summary-grid");
		const addCard = (t: string, v: string, s: string) => {
			const c = grid.createDiv("ham-card");
			c.createDiv("ham-card-title").setText(t);
			const val = c.createDiv("ham-card-value");
			val.setText(v);
			val.style.color = this.habit.color;
			c.createDiv("ham-card-sub").setText(s);
		};

		addCard("Score", `${overall.percent}%`, `${overall.ok}/${overall.total} días`);
		addCard("Racha", `${streak.currentStreak}`, `Máxima: ${streak.bestStreak}`);

		// --- CONTENEDOR DE GRÁFICOS DINÁMICO ---
		const chartsWrapper = contentEl.createDiv("ham-charts-wrapper");
		await this.renderCharts(chartsWrapper, entries);

		// --- WEEKLY TABLE ---
		contentEl.createDiv("ham-section-title").setText("Patrón Semanal");
		const stats = await getWeekdayStatsForHabit(this.storage, this.habit.id);
		const table = contentEl.createEl("table", { cls: "ham-weekday-table" });
		const days: WeekdayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

		days.forEach(d => {
			const row = table.createEl("tr");
			row.createEl("td", { text: d });
			const barCell = row.createEl("td");
			const bg = barCell.createDiv("ham-progress-bg");
			
			const fill = bg.createDiv("ham-progress-fill");
			fill.style.background = this.habit.color;
			fill.style.width = `${stats[d].percent}%`;

			row.createEl("td", { text: `${stats[d].percent}%` }).style.textAlign = "right";
		});
	}

	private createRangeBtn(container: HTMLElement, range: TimeRange, label: string) {
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
				await this.renderCharts(wrapper, entries);
			}
		};
	}

	private async renderCharts(container: HTMLElement, entries: HabitEntries) {
		// NUEVO: Obtener promedio de energía
		const avgEnergy = getAverageEnergy(this.habit, entries, this.currentRange);

		// --- 1. Bloque Contexto (Energía y Ánimo) ---
		container.createDiv("ham-section-title").setText("Contexto (Energía y Ánimo)");
		const contextGrid = container.createDiv("ham-summary-grid");

		// Tarjeta Energía
		const energyCard = contextGrid.createDiv("ham-card");
		energyCard.createDiv("ham-card-title").setText("Energía Promedio");
		const enVal = energyCard.createDiv("ham-card-value");
		enVal.setText(avgEnergy === "-" ? "-" : `${avgEnergy}/5`);
		enVal.style.color = "#F9A825"; // Amarillo oscuro
		energyCard.createDiv("ham-card-sub").setText("En días completados");

		// Tarjeta Gráfico Mood (Donut)
		const moodCard = contextGrid.createDiv("ham-card");
		moodCard.style.position = "relative";
		moodCard.style.height = "220px"; // Más altura para legend abajo
		moodCard.style.display = "flex";
		moodCard.style.alignItems = "center";
		moodCard.style.justifyContent = "center";

		const moodCanvas = moodCard.createEl("canvas");

		// --- 2. Gráficos Principales ---
		container.createDiv("ham-section-title").setText("Tendencia");
		const scoreContainer = container.createDiv("ham-chart-container");
		scoreContainer.style.height = "200px";
		scoreContainer.style.position = "relative";
		const scoreCanvas = scoreContainer.createEl("canvas");

		container.createDiv("ham-section-title").setText("Historial");
		const histContainer = container.createDiv("ham-chart-container");
		histContainer.style.height = "200px";
		histContainer.style.position = "relative";
		const histCanvas = histContainer.createEl("canvas");

		// Renderizado
		requestAnimationFrame(async () => {
			this.charts.forEach(c => c.destroy());
			this.charts = [];

			// --- CHART 0: MOOD (DONUT) ---
			const moodData = await getMoodDistribution(this.habit, entries, this.currentRange);
			const ctxMood = moodCanvas.getContext("2d");
			if (ctxMood && moodData.data.length > 0) {
				// Mapeo de colores para emojis
				const moodColors: Record<string, string> = {
					"😫": "#ef5350", // Agotado / Rojo
					"😔": "#ffa726", // Triste / Naranja
					"😑": "#bdbdbd", // Neutro / Gris
					"🙂": "#66bb6a", // Bien / Verde
					"🔥": "#ffca28"  // Genial / Ambar
				};

				const bgColors = moodData.labels.map(l => moodColors[l] || "#999");

				this.charts.push(new Chart(ctxMood, {
					type: 'doughnut',
					data: {
						labels: moodData.labels,
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
									font: { size: 14, family: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif' },
									padding: 8,
									usePointStyle: false
								} 
							}
						},
						layout: { padding: { left: 10, right: 10, top: 8, bottom: 0 } }
					}
				}));
			} else if (moodData.data.length === 0) {
				// Si no hay datos, mostrar texto
				moodCard.empty();
				moodCard.createDiv({ text: "Sin datos de ánimo", cls: "ht-empty", attr: { style: "font-size: 0.8em;" } });
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
							label: "Score",
							data: scoreData.values,
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
			const histData = buildHistorySeries(this.habit, entries, this.currentRange);
			const ctxHist = histCanvas.getContext("2d");
			if (ctxHist) {
				this.charts.push(new Chart(ctxHist, {
					type: "bar",
					data: {
						labels: histData.labels,
						datasets: [{
							label: "Valor",
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