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
    private freqMode: any;
    private daysPerWeek: number;
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
        this.freqMode = this.habit.frequency?.mode || "daily";
        this.daysPerWeek = this.habit.frequency?.daysPerWeek || 1;
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
		const freqSetting = new Setting(contentEl).setName(t("frequency", lang)).setDesc(t("frequency-desc", lang));
        freqSetting.controlEl.style.position = "relative";

        const freqOptions = [
            { value: "daily", label: t("freq-daily", lang) },
            { value: "weekdays", label: t("freq-weekdays", lang) },
            { value: "weekly", label: t("freq-weekly", lang) },
            { value: "custom", label: t("freq-custom", lang) }
        ];

        const initialFreqLabel = freqOptions.find(o => o.value === this.freqMode)?.label || t("freq-daily", lang);
        const freqBtn = freqSetting.controlEl.createEl("button", { cls: "ht-fake-select", text: initialFreqLabel });
        const freqSuggester = freqSetting.controlEl.createDiv("ht-category-suggester ht-is-hidden");
        
        freqOptions.forEach(opt => {
            const item = freqSuggester.createDiv("ht-suggester-item");
            item.setText(opt.label);
            item.onclick = (e) => {
                e.stopPropagation();
                this.freqMode = opt.value as any;
                freqBtn.setText(opt.label);
                customFreqContainer.toggleClass("is-hidden", opt.value !== "custom");
                freqSuggester.addClass("ht-is-hidden");
            };
        });

        freqBtn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            freqSuggester.classList.toggle("ht-is-hidden");
        };

        const freqClickHandler = (e: MouseEvent) => {
            if (!freqBtn.contains(e.target as Node) && !freqSuggester.contains(e.target as Node)) {
                freqSuggester.addClass("ht-is-hidden");
            }
        };
        document.addEventListener("click", freqClickHandler);

		const customFreqContainer = contentEl.createDiv("ht-custom-freq-block");
		if (this.freqMode !== "custom") customFreqContainer.addClass("is-hidden");

		new Setting(customFreqContainer)
			.setName(t("days-per-week", lang))
			.addSlider(slider => slider
				.setLimits(1, 6, 1)
				.setValue(this.daysPerWeek)
				.setDynamicTooltip()
				.onChange(v => this.daysPerWeek = v)
			);

		// Tipo y Meta
		const typeContainer = contentEl.createDiv("ht-type-toggle");
		const btnYesNo = typeContainer.createEl("button", { text: t("type-yesno", lang), cls: "hem-toggle-btn" });
		const btnQuant = typeContainer.createEl("button", { text: t("type-quant", lang), cls: "hem-toggle-btn" });
		const goalBlock = contentEl.createDiv("ht-goal-block");

		new Setting(goalBlock).setName(t("goal", lang))
			.addText(text => {
				text.inputEl.type = "number";
				text.setValue(String(this.goalVal || "")).onChange(v => this.goalVal = Number(v));
			});
		
		new Setting(goalBlock).setName(t("unit", lang))
			.addText(text => text.setPlaceholder(t("unit-placeholder", lang)).setValue(this.goalUnit).onChange(v => this.goalUnit = v));

		const condSetting = new Setting(goalBlock).setName(t("condition", lang));
        condSetting.controlEl.style.position = "relative";
        
        const condOptions = [
            { value: "atLeast", label: t("cond-atleast", lang) },
            { value: "atMost", label: t("cond-atmost", lang) },
            { value: "exactly", label: t("cond-exactly", lang) }
        ];
        
        const initialCondLabel = condOptions.find(o => o.value === this.goalType)?.label || t("cond-atleast", lang);
        const condBtn = condSetting.controlEl.createEl("button", { cls: "ht-fake-select", text: initialCondLabel });
        const condSuggester = condSetting.controlEl.createDiv("ht-category-suggester ht-is-hidden");
        
        condOptions.forEach(opt => {
            const item = condSuggester.createDiv("ht-suggester-item");
            item.setText(opt.label);
            item.onclick = (e) => {
                e.stopPropagation();
                this.goalType = opt.value as GoalType;
                condBtn.setText(opt.label);
                condSuggester.addClass("ht-is-hidden");
            };
        });

        condBtn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            condSuggester.classList.toggle("ht-is-hidden");
        };

        const condClickHandler = (e: MouseEvent) => {
            if (!condBtn.contains(e.target as Node) && !condSuggester.contains(e.target as Node)) {
                condSuggester.addClass("ht-is-hidden");
            }
        };
        document.addEventListener("click", condClickHandler);

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
		const btnSave = footer.createEl("button", { text: t("save", lang), cls: "mod-cta" });

		btnSave.onclick = () => this.submit();

        // Keyboard Shortcut
        const kbHandler = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                this.submit();
            }
        };
        contentEl.addEventListener("keydown", kbHandler);

        this.onClose = () => {
            document.removeEventListener("click", clickHandler);
            document.removeEventListener("click", freqClickHandler);
            document.removeEventListener("click", condClickHandler);
            contentEl.removeEventListener("keydown", kbHandler);
            contentEl.empty();
        };
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
            daysPerWeek: this.freqMode === "custom" ? this.daysPerWeek : (this.freqMode === "weekly" ? 1 : undefined)
        };

        try {
            await updateHabit(this.storage, updated);
            new Notice(t("habit-updated", this.lang));
            this.onSaved();
            this.close();
        } catch (e) {
            new Notice(t("habit-update-error", this.lang));
        }
    }
}