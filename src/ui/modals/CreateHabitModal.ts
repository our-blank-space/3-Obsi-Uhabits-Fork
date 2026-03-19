import { App, Modal, Setting, Notice } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { createHabit } from "../../core/habits";
import { HabitType, GoalType } from "../../core/types";

export class CreateHabitModal extends Modal {
	storage: HabitStorage;

	constructor(app: App, storage: HabitStorage) {
		super(app);
		this.storage = storage;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("habit-modal");
		contentEl.createEl("h2", { text: "Nuevo hábito" });

		let name = "";
		let type: HabitType = "yesno";
        let icon = "";
		let category = "";
		
        // Variables para Cuantitativo
        let goalValue: number | undefined = undefined;
		let goalType: GoalType = "atLeast";
		let unit = "";

		// Variables para Frecuencia
		let freqMode: string = "daily";
		let daysPerWeek = 1;

		new Setting(contentEl)
			.setName("Nombre")
			.setDesc("Dale un nombre claro a tu nuevo hábito")
			.addText((t) => {
				t.setPlaceholder("Leer, Meditar, Correr...")
					.onChange((v) => (name = v));
                t.inputEl.focus();
			});

		const catSetting = new Setting(contentEl)
			.setName("Categoría (Opcional)")
			.setDesc("Agrupa tus hábitos (ej. Salud, Trabajo, Personal)");
			
        catSetting.controlEl.style.position = "relative";
        let catInputEl: HTMLInputElement = null as any;
		catSetting.addText(t => {
			t.setPlaceholder("Categoría").onChange(v => category = v);
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

        // Hide when clicking outside
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
        let selectedColor = colors[0];
        colors.forEach(c => {
            const swatch = colorGrid.createDiv("ht-color-swatch");
            swatch.style.backgroundColor = c;
            if (c === selectedColor) swatch.addClass("is-active");
            swatch.onclick = () => {
                selectedColor = c;
                colorGrid.querySelectorAll(".ht-color-swatch").forEach(s => s.removeClass("is-active"));
                swatch.addClass("is-active");
            };
        });

		new Setting(contentEl).setName("Icono")
			.setDesc("Usa un emoji (ej: 📚, 🧘, 🏃)")
			.addText(t => t.setPlaceholder("📚").onChange(v => icon = v));

		// --- FREQUENCY SELECTION ---
		const freqSetting = new Setting(contentEl).setName("Frecuencia").setDesc("¿Con qué frecuencia planeas hacer esto?");
        freqSetting.controlEl.style.position = "relative";
        
        const freqOptions = [
            { value: "daily", label: "Diario" },
            { value: "weekdays", label: "Días laborables (L-V)" },
            { value: "weekly", label: "Semanal (1 vez)" },
            { value: "custom", label: "Personalizado (N veces/sem)" }
        ];
        
        const freqBtn = freqSetting.controlEl.createEl("button", { cls: "ht-fake-select", text: "Diario" });
        const freqSuggester = freqSetting.controlEl.createDiv("ht-category-suggester ht-is-hidden");
        
        freqOptions.forEach(opt => {
            const item = freqSuggester.createDiv("ht-suggester-item");
            item.setText(opt.label);
            item.onclick = (e) => {
                e.stopPropagation();
                freqMode = opt.value;
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

		const customFreqContainer = contentEl.createDiv("ht-custom-freq-block is-hidden");
		new Setting(customFreqContainer)
			.setName("Días por semana")
			.addSlider(s => s
				.setLimits(1, 6, 1)
				.setValue(1)
				.setDynamicTooltip()
				.onChange(v => daysPerWeek = v)
			);

        // Selector visual de Tipo
		const typeSetting = new Setting(contentEl).setName("Tipo de hábito").setDesc("¿Cómo vas a medir tu progreso?");
		const typeContainer = typeSetting.controlEl.createDiv("ht-type-toggle");

		const btnYesNo = typeContainer.createEl("button", { text: "Sí / No", cls: "hem-toggle-btn" });
		const btnQuant = typeContainer.createEl("button", { text: "Numérico", cls: "hem-toggle-btn" });
		
        // Configuración de Meta (Goal) - Inicialmente oculta
		const goalContainer = contentEl.createDiv("ht-goal-block");
        goalContainer.addClass("is-hidden"); // Oculto por defecto (yesno)

		const goalSetting = new Setting(goalContainer).setName("Objetivo diario");
		goalSetting.addText((t) => {
			t.setPlaceholder("Valor (ej: 20)")
				.onChange((v) => {
					const n = Number(v);
					goalValue = isNaN(n) ? undefined : n;
				});
            t.inputEl.type = "number";
		});
		
        new Setting(goalContainer).setName("Unidad")
            .addText((t) => {
                t.setPlaceholder("min, págs, km...")
                    .onChange((v) => (unit = v));
            });
        
        // Selector de tipo de meta
		const condSetting = new Setting(goalContainer).setName("Condición");
        condSetting.controlEl.style.position = "relative";
        
        const condOptions = [
            { value: "atLeast", label: "Al menos (≥)" },
            { value: "atMost", label: "Como máximo (≤)" },
            { value: "exactly", label: "Exactamente (=)" }
        ];
        
        const condBtn = condSetting.controlEl.createEl("button", { cls: "ht-fake-select", text: "Al menos (≥)" });
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

        // Lógica de Toggle
        const refreshTypeButtons = () => {
			if (type === "yesno") {
                btnYesNo.addClass("is-active");
                btnQuant.removeClass("is-active");
                goalContainer.addClass("is-hidden");
            } else {
                btnQuant.addClass("is-active");
                btnYesNo.removeClass("is-active");
                goalContainer.removeClass("is-hidden");
            }
		};

		btnYesNo.onclick = () => { type = "yesno"; refreshTypeButtons(); };
		btnQuant.onclick = () => { type = "quant"; refreshTypeButtons(); };
		refreshTypeButtons(); // Estado inicial

        // Footer
		const footer = contentEl.createDiv("habit-modal-footer");
		const cancelBtn = footer.createEl("button", { text: "Cancelar" });
		const createBtn = footer.createEl("button", { text: "Crear", cls: "mod-cta" });

		cancelBtn.onclick = () => this.close();
		
        createBtn.onclick = async () => {
			if (!name.trim()) {
				new Notice("El nombre es obligatorio.");
				return;
			}
            
            try {
                await createHabit(this.storage, {
                    name: name.trim(),
                    type,
                    color: selectedColor,
                    icon: icon.trim() || undefined,
					category: category.trim() || undefined,
                    frequency: { 
                        mode: freqMode as any,
                        daysPerWeek: freqMode === "custom" ? daysPerWeek : (freqMode === "weekly" ? 1 : undefined)
                    }, 
                    goal: (type === "quant" && goalValue != null) 
                        ? { type: goalType, value: goalValue, unit: unit.trim() || undefined }
                        : undefined
                });
                this.storage.refresh();
                new Notice(`Hábito "${name}" creado.`);
                this.close();
            } catch (e) {
                new Notice("Error al crear el hábito.");
                console.error(e);
            }
		};
	}

	onClose(): void {
		this.contentEl.empty();
	}
}