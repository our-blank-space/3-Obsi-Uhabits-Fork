import { ItemView, WorkspaceLeaf, Menu, TFile, setIcon, Notice } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { Habit, HabitEntry, HabitEntries } from "../../core/types";
import { evalHabitOnDateWithEntries, setEntry, deleteEntry } from "../../core/entries";
import { sortHabits, reorderHabits, deleteHabit, archiveHabit } from "../../core/habits";
import { todayString, addDays, weekdayShort, getISOWeek, getISOYear } from "../../utils/dates";
import { t, getWeekdays } from "../../i18n";

import { CreateHabitModal } from "../modals/CreateHabitModal";
import { EditHabitModal } from "../modals/EditHabitModal";
import { EntryModal } from "../modals/EntryModal";
import { HabitAnalyticsModal } from "../modals/HabitAnalyticsModal";
import { HabitDetailModal } from "../modals/HabitDetailModal";
import { ArchivedHabitsModal } from "../modals/ArchivedHabitsModal";
import { GlobalDashboardModal } from "../modals/GlobalDashboardModal";
import { ConfirmModal } from "../modals/ConfirmModal";

export const HABIT_VIEW_TYPE = "habit-tracker-view";

export class HomeView extends ItemView {
    storage: HabitStorage;
    private detachEvents?: () => void;

    // Variables Drag & Drop Mobile
    private draggingId: string | null = null;
    private dropTargetId: string | null = null;

    // Variables Resizer
    private leftColWidth: number = 180;
    private activeCategory: string = "all";
    private globalListeners: Array<[string, EventListener]> = [];

    constructor(leaf: WorkspaceLeaf, storage: HabitStorage) {
        super(leaf);
        this.storage = storage;
    }

    getViewType(): string { return HABIT_VIEW_TYPE; }
    getDisplayText(): string { return "Habit Tracker"; }
    getIcon(): string { return "check-circle-2"; }

    async onOpen(): Promise<void> {
        await this.preLoadVisibleData();
        this.render();

        const handler = async () => {
            console.log("Habit Tracker: Refreshing view...");
            await this.preLoadVisibleData();
            this.render();
        };
        this.storage.events.on("changed", handler);
        this.storage.events.on("habit-data-changed", handler);

        this.detachEvents = () => {
            this.storage.events.off("changed", handler);
            this.storage.events.off("habit-data-changed", handler);
        };
    }

    /**
     * Public method to force a full refresh of the view
     */
    async refresh() {
        await this.preLoadVisibleData();
        this.render();
    }

    private async preLoadVisibleData() {
        const habits = this.storage.getData().habits;
        const promises = habits.map(h => this.storage.getEntries(h.id));
        await Promise.all(promises);
    }

    async onClose(): Promise<void> {
        if (this.detachEvents) this.detachEvents();
        this.cleanupGlobalListeners();
    }

    private addGlobalListener(event: string, fn: EventListener, options?: AddEventListenerOptions) {
        document.addEventListener(event, fn, options);
        this.globalListeners.push([event, fn]);
    }

    private cleanupGlobalListeners() {
        this.globalListeners.forEach(([event, fn]) => {
            document.removeEventListener(event, fn);
        });
        this.globalListeners = [];
    }

    render(): void {
        const container = this.containerEl;
        if (!container.hasClass("habit-tracker-root")) {
            container.addClass("habit-tracker-root");
        }
        container.style.setProperty("--ht-left-col-width", `${this.leftColWidth}px`);

        const data = this.storage.getData();
        const settings = data.settingsSnapshot;
        const lang = settings.language;
        const today = todayString();

        // Creamos un fragmento para evitar parpadeos masivos
        const fragment = document.createDocumentFragment();
        const root = document.createElement("div");
        root.className = "ht-render-container";
        fragment.appendChild(root);

        const header = root.createDiv("habit-tracker-header");
        const titleBlock = header.createDiv("ht-header-title-block");
        titleBlock.createEl("h2", { text: t("habit-loop", lang) });

        const controls = header.createDiv("ht-header-right");

        const dashboardBtn = controls.createEl("button", { cls: "ht-btn", text: t("dashboard", lang) });
        setIcon(dashboardBtn, "bar-chart");
        dashboardBtn.onclick = () => new GlobalDashboardModal(this.app, this.storage).open();

        const archiveBtn = controls.createEl("button", { cls: "ht-btn", text: t("archived", lang) });
        setIcon(archiveBtn, "archive");
        archiveBtn.onclick = () => new ArchivedHabitsModal(this.app, this.storage, () => this.render()).open();

        const labelSort = settings.sortMode === 'alpha' ? t("sort-alpha", lang) : t("sort-manual", lang);
        const sortBtn = controls.createEl("button", { cls: "ht-btn", text: `${t("order", lang)}: ${labelSort}` });
        sortBtn.onclick = async () => {
            const next = settings.sortMode === "manual" ? "alpha" : "manual";
            await this.storage.update(d => d.settingsSnapshot.sortMode = next);
        };

        const addBtn = controls.createEl("button", { cls: "ht-btn mod-cta", text: t("new", lang) });
        addBtn.onclick = () => new CreateHabitModal(this.app, this.storage).open();

        const exportBtn = controls.createEl("button", { cls: "ht-btn", text: t("export-month", lang) });
        setIcon(exportBtn, "table");
        exportBtn.onclick = () => this.generateMonthlyExport();

        const sponsorBtn = controls.createEl("button", { cls: "ht-btn", text: t("donate", lang) });
        setIcon(sponsorBtn, "heart");
        sponsorBtn.style.background = "#FF5A5F20";
        sponsorBtn.style.color = "#FF5A5F";
        sponsorBtn.onclick = () => window.open("https://ko-fi.com/andresvega", "_blank");

        // --- DATOS Y CATEGORÍAS ---
        const allActiveHabits = data.habits.filter(h => !h.archived);
        
        // Extraer categorías únicas
        const uniqueCategories = new Set<string>();
        allActiveHabits.forEach(h => {
            if (h.category) uniqueCategories.add(h.category);
        });

        // Crear Dropdown de Categorías si hay alguna
        if (uniqueCategories.size > 0) {
            const catSelect = controls.createEl("select", { cls: "ht-btn ht-category-select" });
            catSelect.createEl("option", { value: "all", text: t("all-categories", lang) });
            Array.from(uniqueCategories).sort().forEach(cat => {
                const opt = catSelect.createEl("option", { value: cat, text: cat });
                if (cat === this.activeCategory) opt.selected = true;
            });
            catSelect.onchange = (e) => {
                this.activeCategory = (e.target as HTMLSelectElement).value;
                this.render();
            };
        }

        let habits = allActiveHabits;
        
        // Filtar por Categoría
        if (this.activeCategory !== "all") {
            habits = habits.filter(h => h.category === this.activeCategory);
        }

        if (settings.autoHideCompletedToday) {
            habits = habits.filter(h => {
                const entries = this.storage.getEntriesSync(h.id);
                return evalHabitOnDateWithEntries(h, today, entries) !== "OK";
            });
        }
        habits = sortHabits(habits, settings.sortMode);

        // --- PROGRESS BAR ---
        if (settings.showDailyProgress) {
            const scheduledTodayHabits = allActiveHabits.filter(h => {
                const entries = this.storage.getEntriesSync(h.id);
                return evalHabitOnDateWithEntries(h, today, entries) !== "OFF";
            });

            const completedToday = scheduledTodayHabits.filter(h => {
                const entries = this.storage.getEntriesSync(h.id);
                return evalHabitOnDateWithEntries(h, today, entries) === "OK";
            }).length;
            
            const totalScheduled = scheduledTodayHabits.length;
            const progressContainer = titleBlock.createDiv("ht-daily-progress-container");
            const total = totalScheduled || 1;
            const percent = Math.round((completedToday / total) * 100);
            
            const progressBar = progressContainer.createDiv("ht-daily-progress-bar");
            progressBar.createDiv({ cls: "ht-daily-progress-fill", attr: { style: `width: ${percent}%` } });
            progressContainer.createSpan({ cls: "ht-daily-progress-text", text: `${completedToday}/${totalScheduled} ${t("today", lang)} (${percent}%)` });
        }

        const dates: string[] = [];
        let base = today;
        const daysToShow = settings.daysVisible || 21;
        for (let i = (daysToShow - 1); i >= 0; i--) dates.push(addDays(base, -i));
        if (settings.dayBarOrientation === "recent-left") dates.reverse();

        // --- GRID ---
        const main = root.createDiv("ht-main");

        // Header Row (Sticky Top)
        const tableHeader = main.createDiv("ht-table-header");
        
        // Sticky Left Corner
        const leftHeader = tableHeader.createDiv("ht-left-header");
        leftHeader.style.width = `${this.leftColWidth}px`;
        leftHeader.setText(t("habit", lang));

        // Resizer (Between Header Corner and Days)
        const resizer = tableHeader.createDiv("ht-resizer");
        this.setupUnifiedResizer(resizer, main);

        // Days Header (Scrolls Horizontal)
        const dayBar = tableHeader.createDiv("habit-tracker-day-bar");
        const weekdayNames = getWeekdays(lang);
        dates.forEach(date => {
            const cell = dayBar.createDiv("ht-day-cell");
            const d = new Date(date + "T00:00:00");
            const dayIdx = d.getDay();
            cell.createDiv("ht-day-weekday").setText(weekdayNames[dayIdx]);
            cell.createDiv("ht-day-date").setText(date.slice(5));
            if (date === today) cell.addClass("is-today");
        });

        // Body (Vertical Scroll)
        const tableBody = main.createDiv("ht-table-body");

        if (habits.length === 0) {
            tableBody.createDiv({ cls: "ht-empty", text: t("no-habits", lang) });
        } else {
            habits.forEach(habit => {
                this.renderUnifiedRow(tableBody, habit, dates, settings.sortMode);
            });
        }

        // SWAP FINAL
        container.empty();
        container.appendChild(fragment);
    }

    // --- LOGICA RESIZER UNIFICADO ---
    private setupUnifiedResizer(resizer: HTMLElement, container: HTMLElement) {
        const start = (e: MouseEvent | TouchEvent) => {
            e.preventDefault();
            this.addGlobalListener("mousemove", move);
            this.addGlobalListener("touchmove", move, { passive: false });
            this.addGlobalListener("mouseup", end);
            this.addGlobalListener("touchend", end);
        };

        const end = () => {
            this.cleanupGlobalListeners();
        };

        const move = (e: MouseEvent | TouchEvent) => {
            let clientX = (e instanceof MouseEvent) ? e.clientX : e.touches[0].clientX;
            const containerRect = container.getBoundingClientRect();
            let newWidth = clientX - containerRect.left;

            if (newWidth < 80) newWidth = 80;
            // Limit width on small screens
            const maxWidthFactor = window.innerWidth < 600 ? 0.5 : 0.7;
            if (newWidth > containerRect.width * maxWidthFactor) newWidth = containerRect.width * maxWidthFactor;

            this.leftColWidth = newWidth;
            container.style.setProperty("--ht-left-col-width", `${newWidth}px`);
        };

        resizer.addEventListener("mousedown", start);
        resizer.addEventListener("touchstart", start, { passive: false });
    }

    // --- RENDER FILAS UNIFICADAS ---
    private renderUnifiedRow(parent: HTMLElement, habit: Habit, dates: string[], sortMode: string) {
        const row = parent.createDiv("ht-row");
        const settings = this.storage.getData().settingsSnapshot;
        const lang = settings.language;
        
        // Columna Meta (Sticky Left)
        const meta = row.createDiv("ht-habit-meta");
        meta.style.width = `${this.leftColWidth}px`;
        meta.dataset.habitId = habit.id;

        // --- DRAG HANDLE ---
        if (sortMode === "manual") {
            const handle = meta.createDiv("ht-drag-handle");
            setIcon(handle, "grip-vertical");
            handle.style.color = habit.color;

            handle.setAttr("draggable", "true");
            handle.ondragstart = (e) => {
                this.draggingId = habit.id;
                meta.addClass("is-dragging-source");
                e.dataTransfer?.setData("text/plain", habit.id);
                e.stopPropagation();
            };
            handle.ondragend = () => {
                this.draggingId = null;
                meta.removeClass("is-dragging-source");
            };

            handle.addEventListener("touchstart", (e) => {
                if (e.cancelable) e.preventDefault();
                this.draggingId = habit.id;
                meta.addClass("is-dragging-source");
                if (navigator.vibrate) navigator.vibrate(20);
            }, { passive: false });

            handle.addEventListener("touchmove", (e) => {
                if (e.cancelable) e.preventDefault();
                const touch = e.touches[0];
                const y = touch.clientY;
                const allRows = Array.from(document.querySelectorAll('.ht-habit-meta'));
                let targetFound: HTMLElement | null = null;
                for (const row of allRows) {
                    const rect = row.getBoundingClientRect();
                    if (y >= rect.top && y <= rect.bottom) { targetFound = row as HTMLElement; break; }
                }
                if (targetFound && targetFound.dataset.habitId !== this.draggingId) {
                    document.querySelectorAll('.is-drop-target').forEach(el => el.removeClass('is-drop-target'));
                    targetFound.addClass('is-drop-target');
                    this.dropTargetId = targetFound.dataset.habitId || null;
                }
            }, { passive: false });

            handle.addEventListener("touchend", async (e) => {
                meta.removeClass("is-dragging-source");
                document.querySelectorAll('.is-drop-target').forEach(el => el.removeClass('is-drop-target'));
                if (this.draggingId && this.dropTargetId && this.draggingId !== this.dropTargetId) {
                    await reorderHabits(this.storage, this.draggingId, this.dropTargetId);
                }
                this.draggingId = null;
                this.dropTargetId = null;
            });

            handle.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); });
            handle.addEventListener("click", (e) => e.stopPropagation());
        } else {
            meta.createDiv({ attr: { style: "width: 24px; flex-shrink:0;" } });
        }

        const iconDiv = meta.createDiv({ cls: "ht-habit-icon", attr: { style: `background-color: ${habit.color}20; color: transparent;` } });
        iconDiv.setText(" "); 

        const infoDiv = meta.createDiv({ cls: "ht-habit-info" });
        const nameText = habit.icon ? `${habit.icon} ${habit.name}` : habit.name;
        infoDiv.createSpan({ cls: "ht-habit-name-text", text: nameText });
        infoDiv.createSpan({ cls: "ht-habit-category", text: habit.category || t("no-category", lang) });

        meta.ondragover = (e) => { e.preventDefault(); };
        meta.ondrop = async (e) => {
            e.preventDefault();
            if (this.draggingId && this.draggingId !== habit.id) {
                await reorderHabits(this.storage, this.draggingId, habit.id);
            }
        };

        meta.onclick = (e) => {
            if ((e.target as HTMLElement).closest(".ht-drag-handle")) return;
            new HabitAnalyticsModal(this.app, { storage: this.storage, habit }).open();
        };

        meta.oncontextmenu = (e) => {
            e.preventDefault();
            const menu = new Menu();
            menu.addItem(i => i.setTitle(t("analytics", lang)).setIcon("bar-chart").onClick(() => new HabitAnalyticsModal(this.app, { storage: this.storage, habit }).open()));
            menu.addItem(i => i.setTitle(t("details", lang)).setIcon("info").onClick(() => new HabitDetailModal(this.app, { storage: this.storage, habit }).open()));
            menu.addItem(i => i.setTitle(t("edit", lang)).setIcon("pencil").onClick(() => new EditHabitModal(this.app, this.storage, habit, () => this.render()).open()));
            menu.addSeparator();
            menu.addItem(i => i.setTitle(t("archive", lang)).setIcon("archive").onClick(async () => {
                const s = this.storage.getData().settingsSnapshot;
                if (s.confirmArchive) {
                    new ConfirmModal(this.app, t("archive", lang), `${t("confirm-archive", lang)} "${habit.name}"?`, async () => {
                        await archiveHabit(this.storage, habit.id);
                    }, t("archive", lang), "mod-cta").open();
                } else {
                    await archiveHabit(this.storage, habit.id);
                }
            }));
            menu.addItem(i => i.setTitle(t("delete", lang)).setIcon("trash").setWarning(true).onClick(() => {
                new ConfirmModal(this.app, t("delete", lang), `${t("confirm-delete", lang)}`, () => {
                    deleteHabit(this.storage, habit.id);
                }).open();
            }));
            menu.showAtMouseEvent(e);
        };

        const cellsContainer = row.createDiv("ht-habit-cells-container");
        const entriesData = this.storage.getEntriesSync(habit.id);

        dates.forEach(date => {
            const cell = cellsContainer.createDiv("ht-habit-cell");
            const ev = evalHabitOnDateWithEntries(habit, date, entriesData);
            const entry = entriesData.entries[date];

            if (ev === "OFF") {
                cell.addClass("is-not-scheduled");
                return; // No renderizar contenido para días no programados
            }

            const content = cell.createDiv("ht-cell-content");

            if (ev === "OK") {
                content.addClass("is-done"); 
                content.setAttr("style", `color: ${habit.color}`); 
                setIcon(content, "check");
            } else if (ev === "NO") {
                content.addClass("is-fail"); 
                setIcon(content, "x");
            } else if (entry && typeof entry.value === "number") {
                content.addClass("is-done"); 
                content.setAttr("style", `color: ${habit.color}`);
                content.createSpan({ cls: "ht-cell-value", text: String(entry.value) });
            }
            if (entry?.notePath) {
                const file = this.app.vault.getAbstractFileByPath(entry.notePath);
                if (file instanceof TFile) {
                    const noteIcon = cell.createSpan({ cls: "ht-cell-note" });
                    noteIcon.onclick = (e) => { e.stopPropagation(); this.app.workspace.getLeaf(true).openFile(file); };
                }
            }
            this.addLongPressHandlers(
                cell,
                () => this.handleCellClick(habit, date, entry),
                () => this.openEntryModal(habit, date, entry)
            );
        });
    }

    private async handleCellClick(habit: Habit, date: string, entry?: HabitEntry) {
        if (habit.type === "yesno") {
            const currentValue = entry?.value;
            const nextValue = currentValue === "✔" ? "NONE" : "✔";
            if (nextValue === "NONE") { await deleteEntry(this.storage, habit.id, date); } 
            else { await setEntry(this.storage, habit.id, date, "✔"); }
            return;
        }
        this.openEntryModal(habit, date, entry);
    }

    private openEntryModal(habit: Habit, date: string, entry?: HabitEntry) {
        new EntryModal(this.app, {
            storage: this.storage,
            habit,
            date,
            entry,
            onSave: async () => { },
            onDelete: async () => { }
        }).open();
    }

    private addLongPressHandlers(el: HTMLElement, onTap: () => void, onLongPress: () => void, duration = 400) {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let startX = 0, startY = 0;
        let fired = false;

        const start = (x: number, y: number) => {
            fired = false;
            startX = x; startY = y;
            timer = setTimeout(() => {
                fired = true;
                if (navigator.vibrate) navigator.vibrate(30);
                el.addClass("ht-cell-long-press");
                onLongPress();
                setTimeout(() => el.removeClass("ht-cell-long-press"), 300);
            }, duration);
        };

        const cancel = (x: number, y: number) => {
            const threshold = 20; 
            if (Math.abs(x - startX) > threshold || Math.abs(y - startY) > threshold) {
                if (timer) clearTimeout(timer);
                fired = true; 
            }
            if (timer) { clearTimeout(timer); timer = null; }
        };

        el.addEventListener("mousedown", (e) => start(e.clientX, e.clientY));
        el.addEventListener("mousemove", (e) => cancel(e.clientX, e.clientY));
        el.addEventListener("mouseup", () => { if (timer) { clearTimeout(timer); timer = null; } });
        el.addEventListener("click", (e) => { e.stopPropagation(); if (!fired) onTap(); });

        el.addEventListener("touchstart", (e) => {
            const t = e.touches[0];
            start(t.clientX, t.clientY);
        }, { passive: true });
        el.addEventListener("touchmove", (e) => {
            const t = e.touches[0];
            cancel(t.clientX, t.clientY);
        });
        el.addEventListener("touchend", (e) => {
            if (timer) { clearTimeout(timer); timer = null; }
            if (!fired) { 
                if (e.cancelable) e.preventDefault(); 
                onTap(); 
            }
        });
        el.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    private async generateMonthlyExport() {
        const today = todayString();
        const settings = this.storage.getData().settingsSnapshot;
        const lang = settings.language;
        const [year, month] = today.split("-");
        const daysInMonth = new Date(Number(year), Number(month), 0).getDate();

        const monthDays: string[] = [];
        for (let i = 1; i <= daysInMonth; i++) {
            const dd = String(i).padStart(2, "0");
            monthDays.push(`${year}-${month}-${dd}`);
        }

        const data = this.storage.getData();
        const habits = data.habits.filter(h => !h.archived);
        const folder = (settings.notesFolder || "Habit Logs").trim();

        await this.preLoadVisibleData();

        const hDate = t("table-header-date", lang);
        const hHabit = t("table-header-habit", lang);
        const hValue = t("table-header-value", lang);
        const hMood = t("table-header-mood", lang);
        const hNotes = t("table-header-notes", lang);

        const mdHeader = [
            `| ${hDate} | ${hHabit} | ${hValue} | ${hMood} | ${hNotes} |`,
            "|---|---|---|---|---|"
        ];
        const mdRows: string[] = [];

        monthDays.forEach(dateStr => {
            const dayIdx = new Date(dateStr + "T00:00:00").getDay();
            const dayLabel = getWeekdays(lang)[dayIdx];
            const dateWithDay = `${dateStr} (${dayLabel})`;

            habits.forEach(habit => {
                const entriesData = this.storage.getEntriesSync(habit.id);
                const entry = entriesData.entries[dateStr];
                if (!entry) return;

                let binaryHabit = "0";
                let quantValue = "-";

                if (habit.type === "yesno") {
                    binaryHabit = entry.value === "✔" ? "1" : "0";
                    quantValue = binaryHabit;
                } else if (typeof entry.value === "number") {
                    binaryHabit = entry.value > 0 ? "1" : "0";
                    quantValue = String(Math.floor(entry.value));
                }

                const mood = entry.mood || "-";
                const obs = (entry.notes || "").replace(/\n/g, " ").replace(/\|/g, "\\|");

                mdRows.push(`| ${dateWithDay} | ${habit.name}: ${binaryHabit} | ${quantValue} | ${mood} | ${obs} |`);
            });
        });

        const status = mdRows.length > 0 ? "🟢" : "⬜";
        const frontmatter = [
            "---",
            "type: 97-Log",
            "tags: [system/habit-log]",
            `month: ${year}-${month}`,
            `status: ${status}`,
            "---",
            ""
        ].join("\n");

        const habitStats = habits.map(h => {
            const entriesData = this.storage.getEntriesSync(h.id);
            const scheduledDays = monthDays.filter(d => {
                return evalHabitOnDateWithEntries(h, d, entriesData) !== "OFF";
            });
            const validDaysCount = scheduledDays.length || 1;
            const count = scheduledDays.filter(d => {
                const ev = evalHabitOnDateWithEntries(h, d, entriesData);
                return ev === "OK";
            }).length;
            const pct = validDaysCount > 0 ? Math.round((count / validDaysCount) * 100) : 0;
            return `- **${h.name}**: ${count}/${scheduledDays.length} (${pct}%)`;
        }).join("\n");

        const summary = [
            `## ${t("export-month", lang)}`,
            "",
            habitStats,
            "",
            "---",
            ""
        ].join("\n");

        const tableContent = mdRows.length > 0
            ? [...mdHeader, ...mdRows].join("\n")
            : mdHeader.join("\n") + `\n_(${t("no-entries", lang)})_`;

        const content = frontmatter + summary + tableContent;
        const filename = `${t("log-filename", lang)}_${year}-${month}.md`;
        const filePath = folder + "/" + filename;

        try {
            if (!this.app.vault.getAbstractFileByPath(folder)) { await this.app.vault.createFolder(folder); }
            const existing = this.app.vault.getAbstractFileByPath(filePath);
            let file: TFile;
            if (existing instanceof TFile) { await this.app.vault.modify(existing, content); file = existing; } 
            else { file = await this.app.vault.create(filePath, content); }
            new Notice(`${t("export-success", lang)}: ${filename}`);
            await this.app.workspace.getLeaf(true).openFile(file);
        } catch (e) {
            new Notice(t("export-error", lang));
        }
    }
}
