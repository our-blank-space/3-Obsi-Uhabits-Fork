import { ItemView, WorkspaceLeaf, Menu, TFile, setIcon, Notice } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { Habit, HabitEntry, HabitEntries } from "../../core/types";
import { evalHabitOnDateWithEntries, setEntry, deleteEntry } from "../../core/entries";
import { sortHabits, reorderHabits, deleteHabit, archiveHabit } from "../../core/habits";
import { todayString, addDays, weekdayShort, weekdaySpanish, getISOWeek, getISOYear } from "../../utils/dates";

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
        const today = todayString();

        // Creamos un fragmento para evitar parpadeos masivos
        const fragment = document.createDocumentFragment();
        const root = document.createElement("div");
        root.className = "ht-render-container";
        fragment.appendChild(root);

        const header = root.createDiv("habit-tracker-header");
        const titleBlock = header.createDiv("ht-header-title-block");
        titleBlock.createEl("h2", { text: "Habit Loop" });

        const controls = header.createDiv("ht-header-right");

        const dashboardBtn = controls.createEl("button", { cls: "ht-btn", text: "Dashboard" });
        setIcon(dashboardBtn, "bar-chart");
        dashboardBtn.onclick = () => new GlobalDashboardModal(this.app, this.storage).open();

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

        const sponsorBtn = controls.createEl("button", { cls: "ht-btn mod-cta-support", text: "Donar" });
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
            catSelect.createEl("option", { value: "all", text: "Todas las categorías" });
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
            const completedToday = habits.filter(h => {
                // Para el progreso diario usamos todos los habitos no archivados (aunque esten ocultos por autoHide)
                // O mejor aun, basarnos en los habitos filtrados si el usuario quiere ver el progreso de lo que queda.
                // Decidimos usar los habitos visibles (no archivados).
                const allVisible = data.habits.filter(h => !h.archived);
                const entries = this.storage.getEntriesSync(h.id);
                return evalHabitOnDateWithEntries(h, today, entries) === "OK";
            }).length;
            
            const allVisibleCount = data.habits.filter(h => !h.archived).length;
            const progressContainer = titleBlock.createDiv("ht-daily-progress-container");
            const total = allVisibleCount || 1;
            const percent = Math.round((completedToday / total) * 100);
            
            const progressBar = progressContainer.createDiv("ht-daily-progress-bar");
            progressBar.createDiv({ cls: "ht-daily-progress-fill", attr: { style: `width: ${percent}%` } });
            progressContainer.createSpan({ cls: "ht-daily-progress-text", text: `${completedToday}/${allVisibleCount} hoy (${percent}%)` });
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
        leftHeader.setText("Hábito");

        // Resizer (Between Header Corner and Days)
        const resizer = tableHeader.createDiv("ht-resizer");
        // We reuse setupResizer, but we need to pass a collection of all meta cells
        // In this new layout, we'll probably just use CSS variables for width
        this.setupUnifiedResizer(resizer, main);

        // Days Header (Scrolls Horizontal)
        const dayBar = tableHeader.createDiv("habit-tracker-day-bar");
        dates.forEach(date => {
            const cell = dayBar.createDiv("ht-day-cell");
            cell.createDiv("ht-day-weekday").setText(weekdayShort(date, settings.firstDayOfWeek));
            cell.createDiv("ht-day-date").setText(date.slice(5));
            if (date === today) cell.addClass("is-today");
        });

        // Body (Vertical Scroll)
        const tableBody = main.createDiv("ht-table-body");

        if (habits.length === 0) {
            tableBody.createDiv({ cls: "ht-empty", text: "No hay hábitos visibles." });
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
            if (newWidth > containerRect.width * 0.7) newWidth = containerRect.width * 0.7;

            this.leftColWidth = newWidth;
            container.style.setProperty("--ht-left-col-width", `${newWidth}px`);
            
            // También actualizamos los elementos que tengan el ancho inline si es necesario, 
            // pero con la variable CSS debería bastar si re-renderizamos o si el CSS la usa.
        };

        resizer.addEventListener("mousedown", start);
        resizer.addEventListener("touchstart", start, { passive: false });
    }

    // --- RENDER FILAS UNIFICADAS ---
    private renderUnifiedRow(parent: HTMLElement, habit: Habit, dates: string[], sortMode: string) {
        const row = parent.createDiv("ht-row");
        
        // Columna Meta (Sticky Left)
        const meta = row.createDiv("ht-habit-meta");
        meta.style.width = `${this.leftColWidth}px`;
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

        const iconDiv = meta.createDiv({ cls: "ht-habit-icon", attr: { style: `background-color: ${habit.color}20; color: transparent;` } });
        iconDiv.setText(" "); // Placeholder if no icon

        const infoDiv = meta.createDiv({ cls: "ht-habit-info" });
        const nameText = habit.icon ? `${habit.icon} ${habit.name}` : habit.name;
        infoDiv.createSpan({ cls: "ht-habit-name-text", text: nameText });
        infoDiv.createSpan({ cls: "ht-habit-category", text: habit.category || "Sin categoría" });

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
            menu.addItem(i => i.setTitle("Detalles").setIcon("info").onClick(() => new HabitDetailModal(this.app, { storage: this.storage, habit }).open()));
            menu.addItem(i => i.setTitle("Editar").setIcon("pencil").onClick(() => new EditHabitModal(this.app, this.storage, habit, () => this.render()).open()));
            menu.addSeparator();
            menu.addItem(i => i.setTitle("Archivar").setIcon("archive").onClick(async () => {
                const s = this.storage.getData().settingsSnapshot;
                if (s.confirmArchive) {
                    new ConfirmModal(this.app, "Archivar Hábito", `¿Deseas archivar "${habit.name}"? Los datos se conservarán pero no aparecerán en la vista principal.`, async () => {
                        await archiveHabit(this.storage, habit.id);
                    }, "Archivar", "mod-cta").open();
                } else {
                    await archiveHabit(this.storage, habit.id);
                }
            }));
            menu.addItem(i => i.setTitle("Eliminar").setIcon("trash").setWarning(true).onClick(() => {
                new ConfirmModal(this.app, "Eliminar Hábito", `¿Estás seguro de que deseas eliminar "${habit.name}"? Esta acción no se puede deshacer.`, () => {
                    deleteHabit(this.storage, habit.id);
                }).open();
            }));
            menu.showAtMouseEvent(e);
        };

        // Columna Celdas (Scroll Horizontal)
        const cellsContainer = row.createDiv("ht-habit-cells-container");
        const entriesData = this.storage.getEntriesSync(habit.id);

        dates.forEach(date => {
            const cell = cellsContainer.createDiv("ht-habit-cell");
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
            // --- Long Press + Quick Tap ---
            this.addLongPressHandlers(
                cell,
                // Quick tap: toggle
                () => this.handleCellClick(habit, date, entry),
                // Long press: open full EntryModal
                () => this.openEntryModal(habit, date, entry)
            );
        });
    }

    private async handleCellClick(habit: Habit, date: string, entry?: HabitEntry) {
        if (habit.type === "yesno") {
            const currentValue = entry?.value;
            const nextValue = currentValue === "✔" ? "NONE" : "✔";
            
            if (nextValue === "NONE") {
                await deleteEntry(this.storage, habit.id, date);
            } else {
                await setEntry(this.storage, habit.id, date, "✔");
            }
            // La vista se refresca automáticamente por los eventos del storage
            return;
        }
        
        new EntryModal(this.app, { 
            storage: this.storage, 
            habit, 
            date, 
            entry, 
            onSave: async () => { }, 
            onDelete: async () => { } 
        }).open();
    }

    // Siempre abre el modal completo (llamado desde long-press)
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

    // Long-press handler: tap rápido (<400ms) invoca onTap, pulsación larga invoca onLongPress
    private addLongPressHandlers(
        el: HTMLElement,
        onTap: () => void,
        onLongPress: () => void,
        duration = 400
    ) {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let startX = 0, startY = 0;
        let fired = false;

        const start = (x: number, y: number) => {
            fired = false;
            startX = x; startY = y;
            timer = setTimeout(() => {
                fired = true;
                // Feedback háptico en mobile
                if (navigator.vibrate) navigator.vibrate(30);
                el.addClass("ht-cell-long-press");
                onLongPress();
                setTimeout(() => el.removeClass("ht-cell-long-press"), 300);
            }, duration);
        };

        const cancel = (x: number, y: number) => {
            // Si el dedo/cursor se movió mucho, cancelamos
            if (Math.abs(x - startX) > 8 || Math.abs(y - startY) > 8) {
                if (timer) clearTimeout(timer);
                fired = true; // evita que el click dispare el tap
            }
            if (timer) { clearTimeout(timer); timer = null; }
        };

        // Desktop
        el.addEventListener("mousedown", (e) => start(e.clientX, e.clientY));
        el.addEventListener("mousemove", (e) => cancel(e.clientX, e.clientY));
        el.addEventListener("mouseup", () => { if (timer) { clearTimeout(timer); timer = null; } });
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!fired) onTap();
        });

        // Mobile Touch
        el.addEventListener("touchstart", (e) => {
            if (e.cancelable) e.preventDefault();
            const t = e.touches[0];
            start(t.clientX, t.clientY);
        }, { passive: false });
        el.addEventListener("touchmove", (e) => {
            const t = e.touches[0];
            cancel(t.clientX, t.clientY);
        });
        el.addEventListener("touchend", (e) => {
            if (timer) { clearTimeout(timer); timer = null; }
            if (!fired) { e.preventDefault(); onTap(); }
        });
        el.addEventListener("contextmenu", (e) => e.preventDefault());
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

        // Calcular estadísticas
        const totalRegistros = mdRows.length;
        const habitStats = habits.map(h => {
            const entriesData = this.storage.getEntriesSync(h.id);
            const count = monthDays.filter(d => {
                const ev = evalHabitOnDateWithEntries(h, d, entriesData);
                return ev === "OK";
            }).length;
            const pct = Math.round((count / monthDays.length) * 100);
            return `- **${h.name}**: ${count}/${monthDays.length} (${pct}%)`;
        }).join("\n");

        const summary = [
            "## Resumen Mensual",
            `Total de entradas registradas: ${totalRegistros}`,
            "",
            "### Cumplimiento por Hábito",
            habitStats,
            "",
            "---",
            ""
        ].join("\n");

        const tableContent = mdRows.length > 0
            ? [...mdHeader, ...mdRows].join("\n")
            : mdHeader.join("\n") + "\n_(Sin registros este mes)_";

        const content = frontmatter + summary + tableContent;
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
