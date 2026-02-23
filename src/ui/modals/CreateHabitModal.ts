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
		
        // Variables para Cuantitativo
        let goalValue: number | undefined = undefined;
		let goalType: GoalType = "atLeast";
		let unit = "";

		new Setting(contentEl)
			.setName("Nombre")
			.addText((t) => {
				t.setPlaceholder("Leer, Meditar, Correr...")
					.onChange((v) => (name = v));
                t.inputEl.focus();
			});

        // Selector visual de Tipo
		const typeSetting = new Setting(contentEl).setName("Tipo de hábito");
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
		new Setting(goalContainer).setName("Condición")
            .addDropdown(d => d
                .addOption("atLeast", "Al menos (≥)")
                .addOption("atMost", "Como máximo (≤)")
                .addOption("exactly", "Exactamente (=)")
                .setValue("atLeast")
                .onChange(v => goalType = v as GoalType)
            );

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
                    color: "#FF8A65", // Color por defecto si no se elige
                    // CORRECCIÓN: Se añade frequency, requerido por la interfaz
                    frequency: { mode: "daily" }, 
                    goal: (type === "quant" && goalValue != null) 
                        ? { type: goalType, value: goalValue, unit: unit.trim() || undefined }
                        : undefined
                });
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