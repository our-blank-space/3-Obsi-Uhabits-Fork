import { App, Modal } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { todayString, addDays, getRangeBounds, compareDateStr } from "../../utils/dates";
import { evalHabitOnDateWithEntries } from "../../core/entries";
import { getStreakInfoForHabit } from "../../core/analytics";
import { Habit, HabitEntries } from "../../core/types";
import { t, translations } from "../../i18n";

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

        const settings = this.storage.getData().settingsSnapshot;
        const lang = settings.language;

		contentEl.createEl("h2", { text: t("global-dashboard", lang) });

		const data = this.storage.getData();
		const activeHabits = data.habits.filter(h => !h.archived);

		if (activeHabits.length === 0) {
			contentEl.createDiv({ cls: "ht-empty", text: t("no-active-habits", lang) });
			return;
		}

		// --- 1. Progress Ring ---
		const today = todayString();
		let okToday = 0;
		let scheduledTodayCount = 0;
		const entriesMap: { habit: Habit, streak: number, entries: HabitEntries }[] = [];

		const promises = activeHabits.map(async (h) => {
			const entries = await this.storage.getEntries(h.id);
			const ev = evalHabitOnDateWithEntries(h, today, entries);
			if (ev !== "OFF") scheduledTodayCount++;
			if (ev === "OK") okToday++;
			const info = await getStreakInfoForHabit(this.storage, h.id);
			return { habit: h, streak: info.currentStreak, entries };
		});

		const results = await Promise.all(promises);
		results.forEach(r => entriesMap.push(r));

		const denom = scheduledTodayCount > 0 ? scheduledTodayCount : 1;
		const todayPercent = Math.round((okToday / denom) * 100) || 0;
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
		ringInfo.createDiv("ht-ring-label").setText(t("completed-today", lang));
		
		const ringSubtext = ringCard.createDiv("ht-ring-subtext");
		ringSubtext.setText(`${okToday} / ${scheduledTodayCount} ${t("habits-completed-summary", lang)}`);

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

		createStatCard("🔥", String(topStreak), t("best-streak", lang), "#FF6321");
		createStatCard("📊", String(avgStreak), t("avg-streak-label", lang), "#6366F1");
		createStatCard("⚡", String(activeHabits.length), t("active-habits-count", lang), "#10B981");

		// --- 3. Top 5 Rachas ---
		const streakSection = contentEl.createDiv("ht-dashboard-section");
		const streakTitle = streakSection.createDiv("ht-dashboard-section-title");
		streakTitle.setText(`🏆 ${t("top-active-streaks", lang)}`);

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
			streakSection.createDiv({ text: t("no-streaks-yet", lang), cls: "ht-empty" });
		}

		// --- 4. Consistencia Semanal ---
		const weekSection = contentEl.createDiv("ht-dashboard-section");
		weekSection.createDiv("ht-dashboard-section-title").setText(`📅 ${t("last-7-days", lang)}`);
		
		const { from, to } = getRangeBounds("week");
		let totalOkWeek = 0;
		let totalPossible = 0;

		for (let d = from; compareDateStr(d, to) <= 0; d = addDays(d, 1)) {
			if (compareDateStr(d, today) > 0) break;
			for (const item of entriesMap) {
				const ev = evalHabitOnDateWithEntries(item.habit, d, item.entries);
				if (ev !== "NONE" && ev !== "OFF") {
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
		weekMeta.createSpan({ cls: "ht-week-label", text: `${totalOkWeek} / ${totalPossible} ${t("consistency-summary", lang)}` });

		// --- 5. Global Activity Heatmap ---
		const heatmapSection = contentEl.createDiv("ht-dashboard-section");
		heatmapSection.createDiv("ht-dashboard-section-title").setText(`🔥 ${t("global-activity", lang) || "Actividad Global"}`); 

		const heatmapWrapper = heatmapSection.createDiv("ht-global-heatmap-wrapper");
        
        const daysToRender = 364; // 52 weeks
        const weeks: (string | null)[][] = [];
        let curWeek: (string | null)[] = [];
        
        for (let i = daysToRender; i >= 0; i--) {
             const d = addDays(today, -i);
             const dObj = new Date(d + "T00:00:00");
             const wDay = dObj.getDay();

             if (curWeek.length === 0 && wDay !== 0) {
                 for(let p=0; p<wDay; p++) {
                     curWeek.push(null);
                 }
             }
             
             curWeek.push(d);
             
             if (curWeek.length === 7 || i === 0) {
                 while(curWeek.length > 0 && curWeek.length < 7) { curWeek.push(null); }
                 if (curWeek.length > 0) weeks.push(curWeek);
                 curWeek = [];
             }
        }

        const heatmapBody = heatmapWrapper.createDiv("ht-global-heatmap-body");
        const weekdaysEl = heatmapBody.createDiv("ht-global-heatmap-weekdays");
        
        const lKey = lang === "auto" ? (localStorage.getItem("language") === "es" ? "es" : "en") : lang;
        const shortLabels = (translations as any)[lKey]?.["weekday-labels-short"] || ["S","M","T","W","T","F","S"];

        weekdaysEl.createSpan({text: ""}); 
        weekdaysEl.createSpan({text: shortLabels[1] || "M"}); 
        weekdaysEl.createSpan({text: ""}); 
        weekdaysEl.createSpan({text: shortLabels[3] || "W"}); 
        weekdaysEl.createSpan({text: ""}); 
        weekdaysEl.createSpan({text: shortLabels[5] || "F"}); 
        weekdaysEl.createSpan({text: ""}); 
        
		const heatmapGrid = heatmapBody.createDiv("ht-global-heatmap-grid");
        const opacities = ["0.2", "0.4", "0.6", "0.8", "1.0"];
        
        weeks.forEach(week => {
             const col = heatmapGrid.createDiv("ht-global-heatmap-col");
             for (let i = 0; i < 7; i++) {
                 const dayStr = week[i];
                 if (!dayStr) {
                     col.createDiv("ht-global-heatmap-box is-empty");
                 } else {
                     let completions = 0;
                     let totalPossible = 0;
                     entriesMap.forEach(r => {
                          const ev = evalHabitOnDateWithEntries(r.habit, dayStr, r.entries);
                          if (ev !== "NONE" && ev !== "OFF") {
                               totalPossible++;
                               if (ev === "OK") completions++;
                          }
                     });
                     
                     const box = col.createDiv("ht-global-heatmap-box");
                     if (totalPossible > 0 && completions > 0) {
                         const p = completions / totalPossible;
                         let level = 0;
                         if (p <= 0.25) level = 0;
                         else if (p <= 0.5) level = 1;
                         else if (p <= 0.75) level = 2;
                         else if (p < 1.0) level = 3;
                         else level = 4;
                         
                         box.style.backgroundColor = "var(--interactive-accent)";
                         box.style.opacity = opacities[level];
                     }
                     box.title = `${dayStr}: ${completions} / ${totalPossible}`;
                 }
             }
        });

        setTimeout(() => heatmapGrid.scrollLeft = heatmapGrid.scrollWidth, 10);
	}

	onClose() {
		this.contentEl.empty();
	}
}
