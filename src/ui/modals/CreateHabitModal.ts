import { App, Modal, Setting, Notice } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { createHabit } from "../../core/habits";
import { HabitType, GoalType } from "../../core/types";
import { t } from "../../i18n";

export class CreateHabitModal extends Modal {
	storage: HabitStorage;

    // State
    private name = "";
    private type: HabitType = "yesno";
    private icon = "";
    private category = "";
    private selectedColor = "#FF8A65";
    private goalValue: number | undefined = undefined;
    private goalType: GoalType = "atLeast";
    private unit = "";
    private freqMode: string = "daily";
    private selectedDays: number[] = [0,1,2,3,4,5,6];
    private interval: number = 1;
    private daysPerWeek: number | undefined = undefined; 
    private anchorDay: number = 1; // Monday by default
    private lang: any;

	constructor(app: App, storage: HabitStorage) {
		super(app);
		this.storage = storage;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("habit-modal");

        const settings = this.storage.getData().settingsSnapshot;
        this.lang = settings.language;
        const lang = this.lang;

		contentEl.createEl("h2", { text: t("create-habit", lang) });

		new Setting(contentEl)
			.setName(t("habit-name", lang))
			.setDesc(t("habit-name-desc", lang))
			.addText((text) => {
				text.setPlaceholder(t("habit-name-placeholder", lang))
					.onChange((v) => (this.name = v));
                text.inputEl.focus();
			});

		const catSetting = new Setting(contentEl)
			.setName(t("category", lang))
			.setDesc(t("category-desc", lang));
			
        catSetting.controlEl.style.position = "relative";
        let catInputEl: HTMLInputElement = null as any;
		catSetting.addText(text => {
			text.setPlaceholder(t("category-placeholder", lang)).onChange(v => this.category = v);
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
        this.selectedColor = colors[0];
        colors.forEach(c => {
            const swatch = colorGrid.createDiv("ht-color-swatch");
            swatch.style.backgroundColor = c;
            if (c === this.selectedColor) swatch.addClass("is-active");
            swatch.onclick = () => {
                this.selectedColor = c;
                colorGrid.querySelectorAll(".ht-color-swatch").forEach(s => s.removeClass("is-active"));
                swatch.addClass("is-active");
            };
        });

		new Setting(contentEl).setName(t("icon", lang))
			.setDesc(t("icon-desc", lang))
			.addText(text => text.setPlaceholder(t("icon-placeholder", lang)).onChange(v => this.icon = v));

		// --- FREQUENCY SELECTION ---
		new Setting(contentEl).setHeading().setName(t("frequency", lang));
        
        const freqTypeSetting = new Setting(contentEl)
            .setName(t("type", lang))
            .setDesc(t("frequency-desc", lang));

        const anchorDayContainer = contentEl.createDiv("ht-day-selector-container ht-is-hidden");
        const intervalContainer = contentEl.createDiv("ht-interval-days-container ht-is-hidden");

        let updateFrequencyUI = () => {
            // Show "Starting on" for Daily and Weekly
            anchorDayContainer.toggleClass("ht-is-hidden", this.freqMode !== "daily" && this.freqMode !== "weekly");
            // Show "Interval" only for Daily
            intervalContainer.toggleClass("ht-is-hidden", this.freqMode !== "daily");
            
            if (this.freqMode === "daily") {
                this.selectedDays = [0, 1, 2, 3, 4, 5, 6];
                this.renderAnchorSelector(anchorDayContainer);
            } else if (this.freqMode === "weekdays") {
                this.selectedDays = [1, 2, 3, 4, 5];
                this.interval = 1;
            } else if (this.freqMode === "weekly") {
                // For weekly (1x or Nx per week), we allow any day and limit by daysPerWeek
                this.selectedDays = [0, 1, 2, 3, 4, 5, 6]; 
                this.interval = 1;
                this.daysPerWeek = this.daysPerWeek || 1;
                this.renderAnchorSelector(anchorDayContainer);
            }
        };

        // Frequency dropdown
        freqTypeSetting.addDropdown(dropdown => {
            dropdown.addOption("daily", t("freq-daily", lang));
            dropdown.addOption("weekdays", t("freq-weekdays", lang));
            dropdown.addOption("weekly", t("freq-weekly", lang));
            dropdown.setValue(this.freqMode);
            dropdown.onChange(v => {
                this.freqMode = v;
                if (v === "weekly") this.daysPerWeek = this.daysPerWeek || 1;
                else if (v === "daily" || v === "weekdays") this.daysPerWeek = undefined;
                updateFrequencyUI();
            });
        });

        // 🔥 NEW: Days Per Week Goal (Weekly only)
        const dpwContainer = contentEl.createDiv("ht-dpw-container ht-is-hidden");
        new Setting(dpwContainer)
            .setName(t("days-per-week", lang))
            .addText(text => {
                text.setPlaceholder("1")
                    .setValue(String(this.daysPerWeek || 1))
                    .onChange(v => {
                        const n = Number(v);
                        this.daysPerWeek = isNaN(n) || n < 1 ? 1 : n;
                    });
                text.inputEl.type = "number";
            });

        const originalUpdateFrequencyUI = updateFrequencyUI;
        updateFrequencyUI = () => {
            originalUpdateFrequencyUI();
            dpwContainer.toggleClass("ht-is-hidden", this.freqMode !== "weekly");
        };

        // Day Interval for Daily
        new Setting(intervalContainer)
            .setName(t("freq-interval", lang))
            .addText(text => {
                text.setPlaceholder("1")
                    .setValue(String(this.interval))
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

        // Habit Type Visual Selector
		const typeSetting = new Setting(contentEl).setName(t("type", lang)).setDesc(t("type-desc", lang));
		const typeToggleContainer = typeSetting.controlEl.createDiv("ht-type-toggle");

		const btnYesNo = typeToggleContainer.createEl("button", { text: t("type-yesno", lang), cls: "hem-toggle-btn" });
		const btnQuant = typeToggleContainer.createEl("button", { text: t("type-quant", lang), cls: "hem-toggle-btn" });
		
		const goalContainer = contentEl.createDiv("ht-goal-block");
        goalContainer.addClass("is-hidden");

		const goalSetting = new Setting(goalContainer).setName(t("goal", lang));
		goalSetting.addText((text) => {
			text.setPlaceholder(t("goal-placeholder", lang))
				.onChange((v) => {
					const n = Number(v);
					this.goalValue = isNaN(n) ? undefined : n;
				});
            text.inputEl.type = "number";
		});
		
        new Setting(goalContainer).setName(t("unit", lang))
            .addText((text) => {
                text.setPlaceholder(t("unit-placeholder", lang))
                    .onChange((v) => (this.unit = v));
            });
        
		const condSetting = new Setting(goalContainer).setName(t("condition", lang));
        condSetting.addDropdown(d => {
            d.addOption("atLeast", t("cond-atleast", lang));
            d.addOption("atMost", t("cond-atmost", lang));
            d.addOption("exactly", t("cond-exactly", lang));
            d.setValue(this.goalType);
            d.onChange(v => this.goalType = v as GoalType);
        });

        const refreshTypeButtons = () => {
			if (this.type === "yesno") {
                btnYesNo.addClass("is-active");
                btnQuant.removeClass("is-active");
                goalContainer.addClass("is-hidden");
            } else {
                btnQuant.addClass("is-active");
                btnYesNo.removeClass("is-active");
                goalContainer.removeClass("is-hidden");
            }
		};

		btnYesNo.onclick = () => { this.type = "yesno"; refreshTypeButtons(); };
		btnQuant.onclick = () => { this.type = "quant"; refreshTypeButtons(); };
		refreshTypeButtons();

        // Footer
		const footer = contentEl.createDiv("habit-modal-footer");
		const cancelBtn = footer.createEl("button", { text: t("cancel", lang) });
		const createBtn = footer.createEl("button", { text: t("create", lang), cls: "mod-cta" });

		cancelBtn.onclick = () => this.close();
		createBtn.onclick = () => this.submit();

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
                // No restringir selectedDays a un solo día en semanal. 
                // Permitimos cualquier día y limitamos con daysPerWeek.
                this.renderAnchorSelector(parent);
            };
        });
    }

    private async submit() {
        if (!this.name.trim()) {
            new Notice(t("name-required", this.lang));
            return;
        }

        try {
            await createHabit(this.storage, {
                name: this.name.trim(),
                type: this.type,
                color: this.selectedColor,
                icon: this.icon.trim() || undefined,
                category: this.category.trim() || undefined,
                frequency: { 
                    mode: this.freqMode as any,
                    days: this.selectedDays,
                    interval: this.interval,
                    daysPerWeek: this.daysPerWeek,
                    anchorDay: this.anchorDay
                }, 
                goal: (this.type === "quant" && this.goalValue != null) 
                    ? { type: this.goalType, value: this.goalValue, unit: this.unit.trim() || undefined }
                    : undefined
            });
            this.storage.refresh();
            new Notice(`${t("habit-created", this.lang)}: "${this.name}"`);
            this.close();
        } catch (e) {
            new Notice(t("habit-create-error", this.lang));
            console.error(e);
        }
    }
}