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
		let type = this.habit.type;
		let goalVal = this.habit.goal?.value;
		let goalUnit = this.habit.goal?.unit || "";
		let goalType = this.habit.goal?.type || "atLeast";

		new Setting(contentEl).setName("Nombre")
			.addText(t => t.setValue(name).onChange(v => name = v));

		new Setting(contentEl).setName("Color")
			.addColorPicker(c => c.setValue(color).onChange(v => color = v));

		new Setting(contentEl).setName("Icono (Emoji)")
			.addText(t => t.setValue(icon).onChange(v => icon = v));

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
			updated.type = type;
			
			if (type === "quant" && goalVal !== undefined) {
				updated.goal = { value: goalVal, unit: goalUnit, type: goalType as GoalType };
			} else {
				updated.goal = undefined;
			}

			await updateHabit(this.storage, updated);
			this.onSaved();
			this.close();
		};
	}

	onClose() { this.contentEl.empty(); }
}