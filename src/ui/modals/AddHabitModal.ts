import { App, Modal, Setting, Notice } from "obsidian";
import { HabitType, GoalType } from "../../core/types";

export interface AddHabitResult {
	name: string;
	type: HabitType;
	goalValue?: number;
	goalType?: GoalType;
	unit?: string;
}

interface AddHabitModalOptions {
	onCreate: (result: AddHabitResult) => void;
}

export class AddHabitModal extends Modal {
	private onCreate: (result: AddHabitResult) => void;

	private nameValue: string = "";
	private typeValue: HabitType = "yesno";
	private goalValue: number | undefined;
	private goalType: GoalType = "atLeast";
	private unitValue: string = "";

	constructor(app: App, opts: AddHabitModalOptions) {
		super(app);
		this.onCreate = opts.onCreate;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("habit-modal");

		contentEl.createEl("h2", { text: "Nuevo Hábito" });

		// --- Nombre ---
		new Setting(contentEl)
			.setName("Nombre")
			.addText(t => {
				t.setPlaceholder("Ej. Leer, Meditar...")
				 .onChange(v => this.nameValue = v);
				t.inputEl.focus();
			});

		// --- Tipo ---
		const typeContainer = contentEl.createDiv("ht-type-toggle");
		const btnYesNo = typeContainer.createEl("button", { text: "Sí / No", cls: "hem-toggle-btn" });
		const btnQuant = typeContainer.createEl("button", { text: "Numérico", cls: "hem-toggle-btn" });

		// --- Sección Meta (Oculta por defecto) ---
		const goalBlock = contentEl.createDiv("ht-goal-block");
		goalBlock.addClass("is-hidden");
		
		new Setting(goalBlock).setName("Meta diaria")
			.addText(t => {
				t.setPlaceholder("Valor (ej. 30)")
				 .onChange(v => this.goalValue = Number(v));
				t.inputEl.type = "number";
			});
		
		new Setting(goalBlock).setName("Unidad")
			.addText(t => t.setPlaceholder("min, pag, km...").onChange(v => this.unitValue = v));

		new Setting(goalBlock).setName("Condición")
			.addDropdown(d => d
				.addOption("atLeast", "Al menos (≥)")
				.addOption("atMost", "Máximo (≤)")
				.addOption("exactly", "Exactamente (=)")
				.setValue("atLeast")
				.onChange(v => this.goalType = v as GoalType)
			);

		// Lógica de Toggle
		const refreshUI = () => {
			if (this.typeValue === "yesno") {
				btnYesNo.addClass("is-active");
				btnQuant.removeClass("is-active");
				goalBlock.addClass("is-hidden");
			} else {
				btnQuant.addClass("is-active");
				btnYesNo.removeClass("is-active");
				goalBlock.removeClass("is-hidden");
			}
		};

		btnYesNo.onclick = () => { this.typeValue = "yesno"; refreshUI(); };
		btnQuant.onclick = () => { this.typeValue = "quant"; refreshUI(); };
		refreshUI();

		// --- Footer ---
		const footer = contentEl.createDiv("habit-modal-footer");
		const btnCancel = footer.createEl("button", { text: "Cancelar" });
		const btnSave = footer.createEl("button", { text: "Crear", cls: "mod-cta" });

		btnCancel.onclick = () => this.close();
		btnSave.onclick = () => {
			if (!this.nameValue.trim()) {
				new Notice("El nombre es obligatorio");
				return;
			}
			this.onCreate({
				name: this.nameValue,
				type: this.typeValue,
				goalValue: this.goalValue,
				goalType: this.goalType,
				unit: this.unitValue
			});
			this.close();
		};
	}

	onClose() { this.contentEl.empty(); }
}