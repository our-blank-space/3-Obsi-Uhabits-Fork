import { App, Modal } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { todayString, addDays, getRangeBounds, compareDateStr } from "../../utils/dates";
import { evalHabitOnDateWithEntries } from "../../core/entries";
import { getStreakInfoForHabit } from "../../core/analytics";
import { Habit } from "../../core/types";

export class GlobalDashboardModal extends Modal {
	private storage: HabitStorage;

	constructor(app: App, storage: HabitStorage) {
		super(app);
		this.storage = storage;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("habit-modal");

		contentEl.createEl("h2", { text: "Dashboard Global" });

		const data = this.storage.getData();
		const activeHabits = data.habits.filter(h => !h.archived);

		if (activeHabits.length === 0) {
			contentEl.createDiv({ cls: "ht-empty", text: "No tienes hábitos activos aún." });
			return;
		}

		// --- 1. Progress Ring ---
		const today = todayString();
		let okToday = 0;
		const entriesMap: { habit: Habit, streak: number }[] = [];

		const promises = activeHabits.map(async (h) => {
			const entries = await this.storage.getEntries(h.id);
			const ev = evalHabitOnDateWithEntries(h, today, entries);
			if (ev === "OK") okToday++;
			const info = await getStreakInfoForHabit(this.storage, h.id);
			return { habit: h, streak: info.currentStreak };
		});

		const results = await Promise.all(promises);
		results.forEach(r => entriesMap.push(r));

		const todayPercent = Math.round((okToday / activeHabits.length) * 100) || 0;
		const circumference = 2 * Math.PI * 58;
		const offset = circumference - (circumference * todayPercent) / 100;

		// Progress ring card
		const ringCard = contentEl.createDiv("ht-dashboard-ring-card");
		
		const svgNS = "http://www.w3.org/2000/svg";
		const svg = document.createElementNS(svgNS, "svg");
		svg.setAttribute("width", "128"); svg.setAttribute("height", "128");
		svg.setAttribute("viewBox", "0 0 128 128");
		svg.classList.add("ht-ring-svg");

		const trackCircle = document.createElementNS(svgNS, "circle");
		trackCircle.setAttribute("cx", "64"); trackCircle.setAttribute("cy", "64");
		trackCircle.setAttribute("r", "58"); trackCircle.setAttribute("fill", "transparent");
		trackCircle.setAttribute("stroke-width", "8"); trackCircle.classList.add("ht-ring-track");
		svg.appendChild(trackCircle);

		const progressCircle = document.createElementNS(svgNS, "circle");
		progressCircle.setAttribute("cx", "64"); progressCircle.setAttribute("cy", "64");
		progressCircle.setAttribute("r", "58"); progressCircle.setAttribute("fill", "transparent");
		progressCircle.setAttribute("stroke-width", "8");
		progressCircle.setAttribute("stroke-dasharray", String(circumference));
		progressCircle.setAttribute("stroke-dashoffset", String(offset));
		progressCircle.classList.add("ht-ring-progress");
		svg.appendChild(progressCircle);

		ringCard.appendChild(svg);
		const ringInfo = ringCard.createDiv("ht-ring-info");
		ringInfo.createDiv("ht-ring-percent").setText(`${todayPercent}%`);
		ringInfo.createDiv("ht-ring-label").setText("Completado Hoy");
		
		const ringSubtext = ringCard.createDiv("ht-ring-subtext");
		ringSubtext.setText(`${okToday} de ${activeHabits.length} hábitos completados`);

		// --- 2. Stats Cards Row ---
		const statsRow = contentEl.createDiv("ht-dashboard-stats-row");

		const topStreak = entriesMap.reduce((max, r) => r.streak > max ? r.streak : max, 0);
		const avgStreak = entriesMap.length > 0 
			? Math.round(entriesMap.reduce((sum, r) => sum + r.streak, 0) / entriesMap.length)
			: 0;

		const createStatCard = (icon: string, value: string, label: string, color: string) => {
			const card = statsRow.createDiv("ht-stat-card");
			card.createDiv("ht-stat-icon").setText(icon);
			const val = card.createDiv("ht-stat-value");
			val.setText(value);
			val.style.color = color;
			card.createDiv("ht-stat-label").setText(label);
			return card;
		};

		createStatCard("🔥", String(topStreak), "Mejor Racha", "#FF6321");
		createStatCard("📊", String(avgStreak), "Racha Promedio", "#6366F1");
		createStatCard("⚡", String(activeHabits.length), "Hábitos Activos", "#10B981");

		// --- 3. Top 5 Rachas ---
		const streakSection = contentEl.createDiv("ht-dashboard-section");
		const streakTitle = streakSection.createDiv("ht-dashboard-section-title");
		streakTitle.setText("🏆 Top Rachas Activas");

		const topStreaks = [...entriesMap]
			.filter(r => r.streak > 0)
			.sort((a, b) => b.streak - a.streak)
			.slice(0, 5);

		if (topStreaks.length > 0) {
			const list = streakSection.createDiv("ht-streak-list");
			topStreaks.forEach((item, idx) => {
				const row = list.createDiv("ht-streak-row");
				row.createDiv("ht-streak-rank").setText(`#${idx + 1}`);
				const meta = row.createDiv("ht-streak-meta");
				meta.createSpan({ text: item.habit.icon || "✨", cls: "ht-streak-icon" });
				meta.createSpan({ text: item.habit.name, cls: "ht-streak-name" });
				const streakBadge = row.createDiv("ht-streak-badge");
				streakBadge.setText(`${item.streak}d`);
				streakBadge.style.color = item.habit.color;
				streakBadge.style.borderColor = `${item.habit.color}40`;
			});
		} else {
			streakSection.createDiv({ text: "Aún no hay rachas. ¡Empieza hoy!", cls: "ht-empty" });
		}

		// --- 4. Consistencia Semanal ---
		const weekSection = contentEl.createDiv("ht-dashboard-section");
		weekSection.createDiv("ht-dashboard-section-title").setText("📅 Últimos 7 Días");
		
		const { from, to } = getRangeBounds("week");
		let totalOkWeek = 0;
		let totalPossible = 0;

		for (let d = from; compareDateStr(d, to) <= 0; d = addDays(d, 1)) {
			if (compareDateStr(d, today) > 0) break;
			for (const h of activeHabits) {
				const entries = await this.storage.getEntries(h.id);
				const ev = evalHabitOnDateWithEntries(h, d, entries);
				if (ev !== "NONE") {
					totalPossible++;
					if (ev === "OK") totalOkWeek++;
				}
			}
		}

		const weekPercent = totalPossible > 0 ? Math.round((totalOkWeek / totalPossible) * 100) : 0;
		const weekCard = weekSection.createDiv("ht-week-consistency-card");
		
		const barTrack = weekCard.createDiv("ht-week-bar-track");
		const barFill = barTrack.createDiv("ht-week-bar-fill");
		barFill.style.width = `${weekPercent}%`;
		
		const weekMeta = weekCard.createDiv("ht-week-meta");
		weekMeta.createSpan({ cls: "ht-week-percent", text: `${weekPercent}%` });
		weekMeta.createSpan({ cls: "ht-week-label", text: `${totalOkWeek} hits de ${totalPossible} posibles` });
	}

	onClose() {
		this.contentEl.empty();
	}
}
