import { ItemView, WorkspaceLeaf, Menu, TFile, setIcon, Notice } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { Habit, HabitEntry, HabitEntries } from "../../core/types";
import { evalHabitOnDateWithEntries } from "../../core/entries";
import { sortHabits, reorderHabits, deleteHabit, archiveHabit } from "../../core/habits";
import { todayString, addDays, weekdayShort, weekdaySpanish, getISOWeek, getISOYear } from "../../utils/dates";

import { CreateHabitModal } from "../modals/CreateHabitModal";
import { EditHabitModal } from "../modals/EditHabitModal";
import { EntryModal } from "../modals/EntryModal";
import { HabitAnalyticsModal } from "../modals/HabitAnalyticsModal";
import { ArchivedHabitsModal } from "../modals/ArchivedHabitsModal";

export const HABIT_VIEW_TYPE = "habit-tracker-view";

export class HomeView extends ItemView {
    storage: HabitStorage;
    private detachEvents?: () => void;

    // Variables Drag & Drop Mobile
    private draggingId: string | null = null;
    private dropTargetId: string | null = null;

    // Variables Resizer
    private leftColWidth: number = 180;
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
        container.empty();
        container.addClass("habit-tracker-root");

        const data = this.storage.getData();
        const settings = data.settingsSnapshot;
        const today = todayString();

        // --- HEADER ---
        const header = container.createDiv("habit-tracker-header");
        header.createEl("h2", { text: "Habit Loop", attr: { style: "margin:0;" } });

        const controls = header.createDiv("ht-header-right");
        controls.style.display = "flex";
        controls.style.gap = "8px";

        const archiveBtn = controls.createEl("button", { cls: "ht-btn", text: "Archivados" });
        setIcon(archiveBtn, "archive");
        archiveBtn.onclick = () => new ArchivedHabitsModal(this.app, this.storage, () => this.render()).open();

        const labelSort = settings.sortMode === 'alpha' ? "A-Z" : "Manual";
        const sortBtn = controls.createEl("button", { cls: "ht-btn", text: `Orden: ${labelSort}` });
        sortBtn.onclick = async () => {
            const next = settings.sortMode === "manual" ? "alpha" : "manual";
            await this.storage.update(d => d.settingsSnapshot.sortMode = next);
        };

        const addBtn = controls.createEl("button", { cls: "ht-btn mod-cta", text: "Nuevo" });
        addBtn.onclick = () => new CreateHabitModal(this.app, this.storage).open();

        const exportBtn = controls.createEl("button", { cls: "ht-btn", text: "Exportar Mes" });
        setIcon(exportBtn, "table");
        exportBtn.onclick = () => this.generateMonthlyExport();

        // --- DATOS ---
        let habits = data.habits.filter(h => !h.archived);
        if (settings.autoHideCompletedToday) {
            habits = habits.filter(h => {
                const entries = this.storage.getEntriesSync(h.id);
                return evalHabitOnDateWithEntries(h, today, entries) !== "OK";
            });
        }
        habits = sortHabits(habits, settings.sortMode);

        const dates: string[] = [];
        let base = today;
        for (let i = 20; i >= 0; i--) dates.push(addDays(base, -i));
        if (settings.dayBarOrientation === "recent-left") dates.reverse();

        // --- GRID ---
        const main = container.createDiv("ht-main");

        // 1. IZQUIERDA
        const leftCol = main.createDiv("ht-main-left");
        leftCol.style.width = `${this.leftColWidth}px`;

        // 2. RESIZER
        const resizer = main.createDiv("ht-resizer");
        this.setupResizer(resizer, leftCol, main);

        // 3. DERECHA
        const rightColWrap = main.createDiv("ht-main-right");

        // Header Izq
        leftCol.createDiv("ht-left-header-spacer").setText("Hábito");

        // Header Der
        const scrollStrip = rightColWrap.createDiv("ht-scroll-strip");
        const dayBar = scrollStrip.createDiv("habit-tracker-day-bar");
        dates.forEach(date => {
            const cell = dayBar.createDiv("ht-day-cell");
            cell.createDiv("ht-day-weekday").setText(weekdayShort(date, settings.firstDayOfWeek));
            cell.createDiv("ht-day-date").setText(date.slice(5));
            if (date === today) cell.addClass("is-today");
        });

        // --- SCROLL SYNC ---
        let isSyncingLeft = false;
        let isSyncingRight = false;
        leftCol.addEventListener("scroll", () => {
            if (!isSyncingLeft) { isSyncingRight = true; rightColWrap.scrollTop = leftCol.scrollTop; }
            isSyncingLeft = false;
        }, { passive: true });
        rightColWrap.addEventListener("scroll", () => {
            if (!isSyncingRight) { isSyncingLeft = true; leftCol.scrollTop = rightColWrap.scrollTop; }
            isSyncingRight = false;
        }, { passive: true });

        if (habits.length === 0) {
            main.createDiv({ cls: "ht-empty", text: "No hay hábitos visibles." }).style.padding = "20px";
            return;
        }

        habits.forEach(habit => {
            this.renderHabitRow(leftCol, scrollStrip, habit, dates, settings.sortMode);
        });
    }

    // --- LOGICA RESIZER ---
    private setupResizer(resizer: HTMLElement, leftCol: HTMLElement, container: HTMLElement) {
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
            if (newWidth > containerRect.width * 0.7) newWidth = containerRect.width * 0.7;

            this.leftColWidth = newWidth;
            leftCol.style.width = `${newWidth}px`;
        };

        resizer.addEventListener("mousedown", start);
        resizer.addEventListener("touchstart", start, { passive: false });
    }

    // --- RENDER FILAS ---
    private renderHabitRow(leftCol: HTMLElement, scrollStrip: HTMLElement, habit: Habit, dates: string[], sortMode: string) {
        const meta = leftCol.createDiv("ht-habit-meta");
        meta.dataset.habitId = habit.id;

        // --- DRAG HANDLE ---
        if (sortMode === "manual") {
            const handle = meta.createDiv("ht-drag-handle");
            setIcon(handle, "grip-vertical");
            handle.style.color = habit.color;

            // 1. DESKTOP DRAG (Standard)
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

            // 2. MOBILE TOUCH DRAG (Lógica Geométrica)
            handle.addEventListener("touchstart", (e) => {
                // Prevenir scroll del navegador
                if (e.cancelable) e.preventDefault();

                this.draggingId = habit.id;
                meta.addClass("is-dragging-source");

                // Feedback háptico si es posible (Android)
                if (navigator.vibrate) navigator.vibrate(20);

            }, { passive: false });

            handle.addEventListener("touchmove", (e) => {
                // Prevenir scroll
                if (e.cancelable) e.preventDefault();

                const touch = e.touches[0];
                const y = touch.clientY;

                // Buscar qué fila está bajo el dedo (comparando coordenadas)
                // Usamos querySelectorAll fresco para tener posiciones actualizadas
                const allRows = Array.from(document.querySelectorAll('.ht-habit-meta'));

                let targetFound: HTMLElement | null = null;

                for (const row of allRows) {
                    const rect = row.getBoundingClientRect();
                    // Verificar si el dedo está dentro del alto de esta fila
                    if (y >= rect.top && y <= rect.bottom) {
                        targetFound = row as HTMLElement;
                        break;
                    }
                }

                // Si encontramos una fila y no es la misma que arrastramos
                if (targetFound && targetFound.dataset.habitId !== this.draggingId) {
                    // Limpiar highlight anterior
                    document.querySelectorAll('.is-drop-target').forEach(el => el.removeClass('is-drop-target'));

                    // Marcar nueva
                    targetFound.addClass('is-drop-target');
                    this.dropTargetId = targetFound.dataset.habitId || null;
                }

            }, { passive: false });

            handle.addEventListener("touchend", async (e) => {
                // Limpieza visual
                meta.removeClass("is-dragging-source");
                document.querySelectorAll('.is-drop-target').forEach(el => el.removeClass('is-drop-target'));

                // Ejecutar movimiento
                if (this.draggingId && this.dropTargetId && this.draggingId !== this.dropTargetId) {
                    await reorderHabits(this.storage, this.draggingId, this.dropTargetId);
                }

                // Reset variables
                this.draggingId = null;
                this.dropTargetId = null;
            });

            // Bloquear menú contextual en el handle
            handle.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); });
            handle.addEventListener("click", (e) => e.stopPropagation());

        } else {
            meta.createDiv({ attr: { style: "width: 24px; flex-shrink:0;" } });
        }

        meta.createDiv({ cls: "ht-habit-color", attr: { style: `background-color:${habit.color}` } });
        if (habit.icon) meta.createSpan({ cls: "ht-habit-icon", text: habit.icon });
        meta.createSpan({ cls: "ht-habit-name", text: habit.name });

        // Drop Target Desktop
        meta.ondragover = (e) => { e.preventDefault(); };
        meta.ondrop = async (e) => {
            e.preventDefault();
            if (this.draggingId && this.draggingId !== habit.id) {
                await reorderHabits(this.storage, this.draggingId, habit.id);
            }
        };

        // Click Events
        meta.onclick = (e) => {
            if ((e.target as HTMLElement).closest(".ht-drag-handle")) return;
            new HabitAnalyticsModal(this.app, { storage: this.storage, habit }).open();
        };

        meta.oncontextmenu = (e) => {
            e.preventDefault();
            const menu = new Menu();
            menu.addItem(i => i.setTitle("Analíticas").setIcon("bar-chart").onClick(() => new HabitAnalyticsModal(this.app, { storage: this.storage, habit }).open()));
            menu.addItem(i => i.setTitle("Editar").setIcon("pencil").onClick(() => new EditHabitModal(this.app, this.storage, habit, () => this.render()).open()));
            menu.addSeparator();
            menu.addItem(i => i.setTitle("Archivar").setIcon("archive").onClick(() => archiveHabit(this.storage, habit.id)));
            menu.addItem(i => i.setTitle("Eliminar").setIcon("trash").setWarning(true).onClick(() => {
                if (confirm(`¿Eliminar ${habit.name}?`)) deleteHabit(this.storage, habit.id);
            }));
            menu.showAtMouseEvent(e);
        };

        // CELDAS (Derecha)
        const row = scrollStrip.createDiv("ht-habit-cells-row");
        const entriesData = this.storage.getEntriesSync(habit.id);

        dates.forEach(date => {
            const cell = row.createDiv("ht-habit-cell");
            const ev = evalHabitOnDateWithEntries(habit, date, entriesData);
            const entry = entriesData.entries[date];
            const content = cell.createDiv("ht-cell-content");

            if (ev === "OK") {
                content.addClass("is-done"); content.setAttr("style", `color: ${habit.color}`); setIcon(content, "check");
            } else if (ev === "NO") {
                content.addClass("is-fail"); setIcon(content, "x");
            } else if (entry && typeof entry.value === "number") {
                content.addClass("is-done"); content.setAttr("style", `color: ${habit.color}`);
                content.createSpan({ cls: "ht-cell-value", text: String(entry.value) });
            }
            if (entry?.notePath) {
                const file = this.app.vault.getAbstractFileByPath(entry.notePath);
                if (file instanceof TFile) {
                    const noteIcon = cell.createSpan({ cls: "ht-cell-note" });
                    noteIcon.onclick = (e) => { e.stopPropagation(); this.app.workspace.getLeaf(true).openFile(file); };
                }
            }
            cell.onclick = () => this.handleCellClick(habit, date, entry);
        });
    }

    private handleCellClick(habit: Habit, date: string, entry?: HabitEntry) {
        new EntryModal(this.app, { storage: this.storage, habit, date, entry, onSave: async () => { }, onDelete: async () => { } }).open();
    }

    private async generateMonthlyExport() {
        const today = todayString();
        const [year, month] = today.split("-");
        const daysInMonth = new Date(Number(year), Number(month), 0).getDate();

        const monthDays: string[] = [];
        for (let i = 1; i <= daysInMonth; i++) {
            const dd = String(i).padStart(2, "0");
            monthDays.push(`${year}-${month}-${dd}`);
        }

        const data = this.storage.getData();
        const habits = data.habits.filter(h => !h.archived);
        const settings = data.settingsSnapshot;
        const folder = (settings.notesFolder || "Habit Logs").trim();

        await this.preLoadVisibleData();

        // Cabecera Markdown
        const mdHeader = [
            "| Fecha / Día | Hábito (Cualitativo/Binario) | Valor (Cuantitativo) | Estado de Ánimo | Observaciones |",
            "|---|---|---|---|---|"
        ];
        const mdRows: string[] = [];

        monthDays.forEach(dateStr => {
            const dayLabel = weekdaySpanish(dateStr).slice(0, 3);
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

        const tableContent = mdRows.length > 0
            ? [...mdHeader, ...mdRows].join("\n")
            : mdHeader.join("\n") + "\n_(Sin registros este mes)_";

        const content = frontmatter + tableContent;
        const filename = `Log_Habitos_${year}-${month}.md`;
        const filePath = folder + "/" + filename;

        try {
            if (!this.app.vault.getAbstractFileByPath(folder)) {
                await this.app.vault.createFolder(folder);
            }
            const existing = this.app.vault.getAbstractFileByPath(filePath);
            let file: TFile;
            if (existing instanceof TFile) {
                await this.app.vault.modify(existing, content);
                file = existing;
            } else {
                file = await this.app.vault.create(filePath, content);
            }
            new Notice(`✅ ${filename} exportado`);
            await this.app.workspace.getLeaf(true).openFile(file);
        } catch (e) {
            console.error(e);
            new Notice("❌ Error al exportar el log mensual.");
        }
    }
}
