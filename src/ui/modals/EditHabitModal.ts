import { App, Modal, Setting } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { Habit, HabitType, GoalType } from "../../core/types";
import { updateHabit } from "../../core/habits";

export class EditHabitModal extends Modal {
	private storage: HabitStorage;
	private habit: Habit;
	private onSaved: () => void;

	constructor(app: App, storage: HabitStorage, habit: Habit, onSaved: () => void) {
		super(app);
		this.storage = storage;
		this.habit = habit;
		this.onSaved = onSaved;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("habit-modal");
		contentEl.createEl("h2", { text: "Editar Hábito" });

		let name = this.habit.name;
		let color = this.habit.color;
		let icon = this.habit.icon || "";
		let category = this.habit.category || "";
		let type = this.habit.type;
		let goalVal = this.habit.goal?.value;
		let goalUnit = this.habit.goal?.unit || "";
		let goalType = this.habit.goal?.type || "atLeast";
let freqMode = this.habit.frequency?.mode || "daily";
let daysPerWeek = this.habit.frequency?.daysPerWeek || 1;

		new Setting(contentEl).setName("Nombre")
			.setDesc("Actualiza el nombre de tu hábito")
			.addText(t => t.setValue(name).onChange(v => name = v));

		const catSetting = new Setting(contentEl).setName("Categoría (Opcional)")
			.setDesc("Agrupa tus hábitos (ej. Salud, Trabajo)");
			
        catSetting.controlEl.style.position = "relative";
        let catInputEl: HTMLInputElement = null as any;
		catSetting.addText(t => {
			t.setValue(category).onChange(v => category = v);
            catInputEl = t.inputEl;
		});

		const habits = this.storage.getData().habits;
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
                    category = cat;
                    catInputEl.value = cat;
                    suggesterEl.addClass("ht-is-hidden");
                };
            });
        });

        document.addEventListener("click", (e) => {
            if (!catInputEl.contains(e.target as Node) && !suggesterEl.contains(e.target as Node)) {
                suggesterEl.addClass("ht-is-hidden");
            }
        });

        // --- COLOR SELECTION ---
        const colorSetting = new Setting(contentEl).setName("Color").setDesc("Representación visual en el grid");
        const colorGrid = colorSetting.controlEl.createDiv("ht-color-grid");
        const colors = [
            "#FF8A65", "#4DB6AC", "#7986CB", "#F06292", "#AED581", "#FFD54F",
            "#64B5F6", "#9575CD", "#A1887F", "#90A4AE", "#4DD0E1", "#81C784"
        ];
        colors.forEach(c => {
            const swatch = colorGrid.createDiv("ht-color-swatch");
            swatch.style.backgroundColor = c;
            if (c === color) swatch.addClass("is-active");
            swatch.onclick = () => {
                color = c;
                colorGrid.querySelectorAll(".ht-color-swatch").forEach(s => s.removeClass("is-active"));
                swatch.addClass("is-active");
            };
        });

		new Setting(contentEl).setName("Icono (Emoji)")
			.setDesc("Usa un emoji representativo")
			.addText(t => t.setValue(icon).onChange(v => icon = v));

		// --- FREQUENCY SELECTION ---
		const freqSetting = new Setting(contentEl).setName("Frecuencia").setDesc("¿Con qué frecuencia planeas hacer esto?");
        freqSetting.controlEl.style.position = "relative";

        const freqOptions = [
            { value: "daily", label: "Diario" },
            { value: "weekdays", label: "Días laborables (L-V)" },
            { value: "weekly", label: "Semanal (1 vez)" },
            { value: "custom", label: "Personalizado (N veces/sem)" }
        ];

        const initialFreqLabel = freqOptions.find(o => o.value === freqMode)?.label || "Diario";
        const freqBtn = freqSetting.controlEl.createEl("button", { cls: "ht-fake-select", text: initialFreqLabel });
        const freqSuggester = freqSetting.controlEl.createDiv("ht-category-suggester ht-is-hidden");
        
        freqOptions.forEach(opt => {
            const item = freqSuggester.createDiv("ht-suggester-item");
            item.setText(opt.label);
            item.onclick = (e) => {
                e.stopPropagation();
                freqMode = opt.value as any;
                freqBtn.setText(opt.label);
                customFreqContainer.toggleClass("is-hidden", opt.value !== "custom");
                freqSuggester.addClass("ht-is-hidden");
            };
        });

        freqBtn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            freqSuggester.classList.toggle("ht-is-hidden");
        };

        document.addEventListener("click", (e) => {
            if (!freqBtn.contains(e.target as Node) && !freqSuggester.contains(e.target as Node)) {
                freqSuggester.addClass("ht-is-hidden");
            }
        });

		const customFreqContainer = contentEl.createDiv("ht-custom-freq-block");
		if (freqMode !== "custom") customFreqContainer.addClass("is-hidden");

		new Setting(customFreqContainer)
			.setName("Días por semana")
			.addSlider(s => s
				.setLimits(1, 6, 1)
				.setValue(daysPerWeek)
				.setDynamicTooltip()
				.onChange(v => daysPerWeek = v)
			);

		// Tipo y Meta
		const typeContainer = contentEl.createDiv("ht-type-toggle");
		const btnYesNo = typeContainer.createEl("button", { text: "Sí / No", cls: "hem-toggle-btn" });
		const btnQuant = typeContainer.createEl("button", { text: "Numérico", cls: "hem-toggle-btn" });
		const goalBlock = contentEl.createDiv("ht-goal-block");

		new Setting(goalBlock).setName("Valor Meta")
			.addText(t => {
				t.inputEl.type = "number";
				t.setValue(String(goalVal || "")).onChange(v => goalVal = Number(v));
			});
		
		new Setting(goalBlock).setName("Unidad")
			.addText(t => t.setValue(goalUnit).onChange(v => goalUnit = v));

		const condSetting = new Setting(goalBlock).setName("Condición");
        condSetting.controlEl.style.position = "relative";
        
        const condOptions = [
            { value: "atLeast", label: "Al menos (≥)" },
            { value: "atMost", label: "Como máximo (≤)" },
            { value: "exactly", label: "Exactamente (=)" }
        ];
        
        const initialCondLabel = condOptions.find(o => o.value === goalType)?.label || "Al menos (≥)";
        const condBtn = condSetting.controlEl.createEl("button", { cls: "ht-fake-select", text: initialCondLabel });
        const condSuggester = condSetting.controlEl.createDiv("ht-category-suggester ht-is-hidden");
        
        condOptions.forEach(opt => {
            const item = condSuggester.createDiv("ht-suggester-item");
            item.setText(opt.label);
            item.onclick = (e) => {
                e.stopPropagation();
                goalType = opt.value as GoalType;
                condBtn.setText(opt.label);
                condSuggester.addClass("ht-is-hidden");
            };
        });

        condBtn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            condSuggester.classList.toggle("ht-is-hidden");
        };

        document.addEventListener("click", (e) => {
            if (!condBtn.contains(e.target as Node) && !condSuggester.contains(e.target as Node)) {
                condSuggester.addClass("ht-is-hidden");
            }
        });

		const refresh = () => {
			if (type === "yesno") {
				btnYesNo.addClass("is-active"); btnQuant.removeClass("is-active");
				goalBlock.addClass("is-hidden");
			} else {
				btnQuant.addClass("is-active"); btnYesNo.removeClass("is-active");
				goalBlock.removeClass("is-hidden");
			}
		};

		btnYesNo.onclick = () => { type = "yesno"; refresh(); };
		btnQuant.onclick = () => { type = "quant"; refresh(); };
		refresh();

		// Footer
		const footer = contentEl.createDiv("habit-modal-footer");
		const btnSave = footer.createEl("button", { text: "Guardar Cambios", cls: "mod-cta" });

		btnSave.onclick = async () => {
			const updated = { ...this.habit };
			updated.name = name;
			updated.color = color;
			updated.icon = icon;
			updated.category = category.trim() || undefined;
			updated.type = type;
			
			if (type === "quant" && goalVal !== undefined) {
				updated.goal = { value: goalVal, unit: goalUnit, type: goalType as GoalType };
			} else {
				updated.goal = undefined;
			}

            updated.frequency = {
                mode: freqMode as any,
                daysPerWeek: freqMode === "custom" ? daysPerWeek : (freqMode === "weekly" ? 1 : undefined)
            };

			await updateHabit(this.storage, updated);
			this.onSaved();
			this.close();
		};
	}

	onClose() { this.contentEl.empty(); }
}