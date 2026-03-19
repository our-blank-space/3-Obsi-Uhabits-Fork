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
    private daysPerWeek = 1;
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

        // Hide when clicking outside
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
		const freqSetting = new Setting(contentEl).setName(t("frequency", lang)).setDesc(t("frequency-desc", lang));
        freqSetting.controlEl.style.position = "relative";
        
        const freqOptions = [
            { value: "daily", label: t("freq-daily", lang) },
            { value: "weekdays", label: t("freq-weekdays", lang) },
            { value: "weekly", label: t("freq-weekly", lang) },
            { value: "custom", label: t("freq-custom", lang) }
        ];
        
        const freqBtn = freqSetting.controlEl.createEl("button", { cls: "ht-fake-select", text: t("freq-daily", lang) });
        const freqSuggester = freqSetting.controlEl.createDiv("ht-category-suggester ht-is-hidden");
        
        freqOptions.forEach(opt => {
            const item = freqSuggester.createDiv("ht-suggester-item");
            item.setText(opt.label);
            item.onclick = (e) => {
                e.stopPropagation();
                this.freqMode = opt.value;
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

		const customFreqContainer = contentEl.createDiv("ht-custom-freq-block is-hidden");
		new Setting(customFreqContainer)
			.setName(t("days-per-week", lang))
			.addSlider(slider => slider
				.setLimits(1, 6, 1)
				.setValue(1)
				.setDynamicTooltip()
				.onChange(v => this.daysPerWeek = v)
			);

        // Selector visual de Tipo
		const typeSetting = new Setting(contentEl).setName(t("type", lang)).setDesc(t("type-desc", lang));
		const typeContainer = typeSetting.controlEl.createDiv("ht-type-toggle");

		const btnYesNo = typeContainer.createEl("button", { text: t("type-yesno", lang), cls: "hem-toggle-btn" });
		const btnQuant = typeContainer.createEl("button", { text: t("type-quant", lang), cls: "hem-toggle-btn" });
		
        // Configuración de Meta (Goal) - Inicialmente oculta
		const goalContainer = contentEl.createDiv("ht-goal-block");
        goalContainer.addClass("is-hidden"); // Oculto por defecto (yesno)

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
        
        // Selector de tipo de meta
		const condSetting = new Setting(goalContainer).setName(t("condition", lang));
        condSetting.controlEl.style.position = "relative";
        
        const condOptions = [
            { value: "atLeast", label: t("cond-atleast", lang) },
            { value: "atMost", label: t("cond-atmost", lang) },
            { value: "exactly", label: t("cond-exactly", lang) }
        ];
        
        const condBtn = condSetting.controlEl.createEl("button", { cls: "ht-fake-select", text: t("cond-atleast", lang) });
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

        // Lógica de Toggle
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
		refreshTypeButtons(); // Estado inicial

        // Footer
		const footer = contentEl.createDiv("habit-modal-footer");
		const cancelBtn = footer.createEl("button", { text: t("cancel", lang) });
		const createBtn = footer.createEl("button", { text: t("create", lang), cls: "mod-cta" });

		cancelBtn.onclick = () => this.close();
		createBtn.onclick = () => this.submit();

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
                    daysPerWeek: this.freqMode === "custom" ? this.daysPerWeek : (this.freqMode === "weekly" ? 1 : undefined)
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