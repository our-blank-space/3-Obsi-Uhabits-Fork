import { App, Modal, Setting, Notice } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { Habit, HabitType, GoalType } from "../../core/types";
import { updateHabit } from "../../core/habits";
import { t } from "../../i18n";

export class EditHabitModal extends Modal {
	private storage: HabitStorage;
	private habit: Habit;
	private onSaved: () => void;

    // State
    private name: string;
    private color: string;
    private icon: string;
    private category: string;
    private type: HabitType;
    private goalVal: number | undefined;
    private goalUnit: string;
    private goalType: GoalType;
    private freqMode: string;
    private selectedDays: number[];
    private interval: number;
    private anchorDay: number;
    private lang: any;

	constructor(app: App, storage: HabitStorage, habit: Habit, onSaved: () => void) {
		super(app);
		this.storage = storage;
		this.habit = habit;
		this.onSaved = onSaved;

        // Initialize state
        this.name = this.habit.name;
        this.color = this.habit.color;
        this.icon = this.habit.icon || "";
        this.category = this.habit.category || "";
        this.type = this.habit.type;
        this.goalVal = this.habit.goal?.value;
        this.goalUnit = this.habit.goal?.unit || "";
        this.goalType = this.habit.goal?.type || "atLeast";
        
        this.freqMode = (this.habit.frequency?.mode as any) || "daily";
        const oldInt = this.habit.frequency?.interval;
        this.interval = typeof oldInt === "number" ? oldInt : 1;
        this.selectedDays = this.habit.frequency?.days || [0,1,2,3,4,5,6];
        this.anchorDay = this.habit.frequency?.anchorDay ?? 1;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("habit-modal");

        const settings = this.storage.getData().settingsSnapshot;
        this.lang = settings.language;
        const lang = this.lang;

		contentEl.createEl("h2", { text: t("edit-habit", lang) });

		new Setting(contentEl).setName(t("habit-name", lang))
			.setDesc(t("habit-name-update-desc", lang))
			.addText(text => text.setValue(this.name).onChange(v => this.name = v));

		const catSetting = new Setting(contentEl).setName(t("category", lang))
			.setDesc(t("category-desc", lang));
			
        catSetting.controlEl.style.position = "relative";
        let catInputEl: HTMLInputElement = null as any;
		catSetting.addText(text => {
			text.setPlaceholder(t("category-placeholder", lang)).setValue(this.category).onChange(v => this.category = v);
            catInputEl = text.inputEl;
		});

		const data = this.storage.getData();
		const habits = data.habits;
		const categories = Array.from(new Set(habits.map(h => h.category).filter(Boolean))) as string[];
        
        const suggesterEl = catSetting.controlEl.createDiv("ht-category-suggester ht-is-hidden");
        
        catInputEl.addEventListener("focus", () => {
            if (categories.length === 0) return;
            suggesterEl.empty();
            suggesterEl.removeClass("ht-is-hidden");
            categories.forEach(cat => {
                const item = suggesterEl.createDiv("ht-suggester-item");
                item.setText(cat);
                item.onclick = () => {
                    this.category = cat;
                    catInputEl.value = cat;
                    suggesterEl.addClass("ht-is-hidden");
                };
            });
        });

        const clickHandler = (e: MouseEvent) => {
            if (!catInputEl.contains(e.target as Node) && !suggesterEl.contains(e.target as Node)) {
                suggesterEl.addClass("ht-is-hidden");
            }
        };
        document.addEventListener("click", clickHandler);

        // --- COLOR SELECTION ---
        const colorSetting = new Setting(contentEl).setName(t("color", lang)).setDesc(t("color-desc", lang));
        const colorGrid = colorSetting.controlEl.createDiv("ht-color-grid");
        const colors = [
            "#FF8A65", "#4DB6AC", "#7986CB", "#F06292", "#AED581", "#FFD54F",
            "#64B5F6", "#9575CD", "#A1887F", "#90A4AE", "#4DD0E1", "#81C784"
        ];
        colors.forEach(c => {
            const swatch = colorGrid.createDiv("ht-color-swatch");
            swatch.style.backgroundColor = c;
            if (c === this.color) swatch.addClass("is-active");
            swatch.onclick = () => {
                this.color = c;
                colorGrid.querySelectorAll(".ht-color-swatch").forEach(s => s.removeClass("is-active"));
                swatch.addClass("is-active");
            };
        });

		new Setting(contentEl).setName(t("icon", lang))
			.setDesc(t("icon-desc", lang))
			.addText(text => text.setPlaceholder(t("icon-placeholder", lang)).setValue(this.icon).onChange(v => this.icon = v));

		// --- FREQUENCY SELECTION ---
		new Setting(contentEl).setHeading().setName(t("frequency", lang));
        
        const freqTypeSetting = new Setting(contentEl)
            .setName(t("type", lang))
            .setDesc(t("frequency-desc", lang));

        const anchorDayContainer = contentEl.createDiv("ht-day-selector-container ht-is-hidden");
        const intervalContainer = contentEl.createDiv("ht-interval-days-container ht-is-hidden");

        const updateFrequencyUI = () => {
            // Mostrar "Comenzar el" para Diario y Semanal
            anchorDayContainer.toggleClass("ht-is-hidden", this.freqMode !== "daily" && this.freqMode !== "weekly");
            // Mostrar "Intervalo" solo para Diario
            intervalContainer.toggleClass("ht-is-hidden", this.freqMode !== "daily");
            
            if (this.freqMode === "daily") {
                this.selectedDays = [0, 1, 2, 3, 4, 5, 6];
                this.renderAnchorSelector(anchorDayContainer);
            } else if (this.freqMode === "weekdays") {
                this.selectedDays = [1, 2, 3, 4, 5];
                this.interval = 1;
            } else if (this.freqMode === "weekly") {
                this.selectedDays = [this.anchorDay];
                this.interval = 1;
                this.renderAnchorSelector(anchorDayContainer);
            }

            const intervalSettingName = this.freqMode === "daily" ? t("freq-interval", lang) : t("frequency", lang);
            intervalContainer.querySelector(".setting-item-name")?.setText(intervalSettingName);
        };

        freqTypeSetting.addDropdown(dropdown => {
            dropdown.addOption("daily", t("freq-daily", lang));
            dropdown.addOption("weekdays", t("freq-weekdays", lang));
            dropdown.addOption("weekly", t("freq-weekly", lang));
            dropdown.setValue(this.freqMode);
            dropdown.onChange(v => {
                this.freqMode = v;
                updateFrequencyUI();
            });
        });

        new Setting(intervalContainer)
            .setName(t("freq-interval", lang))
            .addText(text => {
                text.setValue(String(this.interval))
                    .onChange(v => {
                        const n = Number(v);
                        this.interval = isNaN(n) || n < 1 ? 1 : n;
                    });
                text.inputEl.type = "number";
            })
            .then(s => {
                s.descEl.setText(t("days-label", lang));
            });

        updateFrequencyUI();

		// Tipo y Meta
		const typeSetting = new Setting(contentEl).setName(t("type", lang)).setDesc(t("type-desc", lang));
		const typeToggleContainer = typeSetting.controlEl.createDiv("ht-type-toggle");

		const btnYesNo = typeToggleContainer.createEl("button", { text: t("type-yesno", lang), cls: "hem-toggle-btn" });
		const btnQuant = typeToggleContainer.createEl("button", { text: t("type-quant", lang), cls: "hem-toggle-btn" });
		const goalBlock = contentEl.createDiv("ht-goal-block");

		new Setting(goalBlock).setName(t("goal", lang))
			.addText(text => {
				text.inputEl.type = "number";
				text.setValue(String(this.goalVal || "")).onChange(v => this.goalVal = Number(v));
			});
		
		new Setting(goalBlock).setName(t("unit", lang))
			.addText(text => text.setPlaceholder(t("unit-placeholder", lang)).setValue(this.goalUnit).onChange(v => this.goalUnit = v));

		const condSetting = new Setting(goalBlock).setName(t("condition", lang));
        condSetting.addDropdown(d => {
            d.addOption("atLeast", t("cond-atleast", lang));
            d.addOption("atMost", t("cond-atmost", lang));
            d.addOption("exactly", t("cond-exactly", lang));
            d.setValue(this.goalType);
            d.onChange(v => this.goalType = v as GoalType);
        });

		const refresh = () => {
			if (this.type === "yesno") {
				btnYesNo.addClass("is-active"); btnQuant.removeClass("is-active");
				goalBlock.addClass("is-hidden");
			} else {
				btnQuant.addClass("is-active"); btnYesNo.removeClass("is-active");
				goalBlock.removeClass("is-hidden");
			}
		};

		btnYesNo.onclick = () => { this.type = "yesno"; refresh(); };
		btnQuant.onclick = () => { this.type = "quant"; refresh(); };
		refresh();

		// Footer
		const footer = contentEl.createDiv("habit-modal-footer");
        const btnCancel = footer.createEl("button", { text: t("cancel", lang) });
		const btnSave = footer.createEl("button", { text: t("save", lang), cls: "mod-cta" });

        btnCancel.onclick = () => this.close();
		btnSave.onclick = () => this.submit();

        this.onClose = () => {
            document.removeEventListener("click", clickHandler);
            contentEl.empty();
        };
	}

    private renderAnchorSelector(parent: HTMLElement) {
        parent.empty();
        parent.createEl("div", { text: t("freq-starting-on", this.lang), cls: "ht-day-label" });
        const grid = parent.createDiv("ht-day-grid");
        
        const days = [
            { id: 1, label: t("monday", this.lang) },
            { id: 2, label: t("tuesday", this.lang) },
            { id: 3, label: t("wednesday", this.lang) },
            { id: 4, label: t("thursday", this.lang) },
            { id: 5, label: t("friday", this.lang) },
            { id: 6, label: t("saturday", this.lang) },
            { id: 0, label: t("sunday", this.lang) },
        ];

        days.forEach(day => {
            const btn = grid.createEl("button", { 
                text: day.label.substring(0, 2), 
                cls: "ht-day-bubble" 
            });
            if (this.anchorDay === day.id) btn.addClass("is-active");
            btn.onclick = (e) => {
                e.preventDefault();
                this.anchorDay = day.id;
                if (this.freqMode === "weekly") {
                    this.selectedDays = [this.anchorDay];
                }
                this.renderAnchorSelector(parent);
            };
        });
    }

    private async submit() {
        const updated = { ...this.habit };
        updated.name = this.name;
        updated.color = this.color;
        updated.icon = this.icon;
        updated.category = this.category.trim() || undefined;
        updated.type = this.type;
        
        if (this.type === "quant" && this.goalVal !== undefined) {
            updated.goal = { value: this.goalVal, unit: this.goalUnit, type: this.goalType as GoalType };
        } else {
            updated.goal = undefined;
        }

        updated.frequency = {
            mode: this.freqMode as any,
            days: this.selectedDays,
            interval: this.interval,
            anchorDay: this.anchorDay
        };

        try {
            await updateHabit(this.storage, updated);
            this.storage.refresh(); 
            new Notice(t("habit-updated", this.lang));
            this.onSaved();
            this.close();
        } catch (e) {
            new Notice(t("habit-update-error", this.lang));
            console.error(e);
        }
    }
}