import { App, Modal, Setting, TextComponent, SliderComponent, TextAreaComponent } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { Habit, HabitEntry } from "../../core/types";
import { setEntry, deleteEntry, evalHabitEntry } from "../../core/entries";
import { createHabitNote, NoteSettings } from "../../utils/notes";

interface EntryModalOptions {
	storage: HabitStorage;
	habit: Habit;
	date: string;
	entry?: HabitEntry;
	onSave: (res: any) => void;
	onDelete: () => void;
}

export class EntryModal extends Modal {
	private storage: HabitStorage;
	private habit: Habit;
	private date: string;
	private entry?: HabitEntry;
	private onSave: (res: any) => void;
	private onDelete: () => void;

	private yesNoValue: "✔" | "✖" = "✔";
	private quantValue: number = 0;
	private notes: string = "";

	// Contexto
	private energyValue: number = 3;
	private moodValue: string = "";

	constructor(app: App, opts: EntryModalOptions) {
		super(app);
		this.storage = opts.storage;
		this.habit = opts.habit;
		this.date = opts.date;
		this.entry = opts.entry;
		this.onSave = opts.onSave;
		this.onDelete = opts.onDelete;

		// Inicializar valores
		if (this.habit.type === "yesno") {
			this.yesNoValue = this.entry?.value === "✖" ? "✖" : "✔";
		} else {
			this.quantValue = typeof this.entry?.value === "number" ? this.entry.value : 0;
		}

		this.energyValue = this.entry?.energy ?? 3;
		this.moodValue = this.entry?.mood ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("habit-entry-modal");

		contentEl.createEl("h2", { text: this.habit.name });
		contentEl.createDiv({ cls: "ht-entry-date", text: this.date });

		// Feedback visual
		const ev = evalHabitEntry(this.habit, this.entry);
		if (ev === "OK") contentEl.addClass("ht-entry-ok");
		else if (ev === "NO") contentEl.addClass("ht-entry-no");

		// --- Input Valor ---
		if (this.habit.type === "yesno") {
			const row = contentEl.createDiv("ht-entry-yesno-row");
			const btnOk = row.createEl("button", { text: "✔" });
			const btnNo = row.createEl("button", { text: "✖" });

			const update = () => {
				btnOk.toggleClass("is-active", this.yesNoValue === "✔");
				btnNo.toggleClass("is-active", this.yesNoValue === "✖");
			};
			btnOk.onclick = () => { this.yesNoValue = "✔"; update(); };
			btnNo.onclick = () => { this.yesNoValue = "✖"; update(); };
			update();
		} else {
			new Setting(contentEl).setName("Valor")
				.setDesc(this.habit.goal ? `Meta: ${this.habit.goal.value}` : "")
				.addText((t: TextComponent) => {
					t.inputEl.type = "number";
					t.setValue(String(this.quantValue))
						.onChange((v: string) => this.quantValue = Number(v));
				});
		}

		// --- Contexto ---
		contentEl.createEl("h4", { text: "Contexto", cls: "ham-section-title" });

		const energyContainer = contentEl.createDiv("ht-context-row");
		new Setting(energyContainer)
			.setName("Nivel de Energía")
			.setDesc("1 (Baja) - 5 (Alta)")
			.addSlider((s: SliderComponent) => s
				.setLimits(1, 5, 1)
				.setValue(this.energyValue)
				.setDynamicTooltip()
				.onChange((v: number) => this.energyValue = v)
			);

		const moodContainer = contentEl.createDiv("ht-mood-selector");
		const moods = ["🙂", "😑", "😔"];
		moods.forEach(m => {
			const btn = moodContainer.createEl("button", { text: m, cls: "ht-mood-btn" });
			if (this.moodValue === m) btn.addClass("is-selected");
			btn.onclick = () => {
				this.moodValue = m;
				moodContainer.querySelectorAll(".ht-mood-btn").forEach((b: HTMLElement) => b.classList.remove("is-selected"));
				btn.addClass("is-selected");
			};
		});

		// --- Observaciones ---
		new Setting(contentEl).setName("Observación")
			.addTextArea((t: TextAreaComponent) => {
				t.setPlaceholder("Opcional...")
					.setValue(this.notes)
					.onChange((v: string) => this.notes = v);
			});

		// --- Footer ---
		const footer = contentEl.createDiv("habit-modal-footer");

		if (this.entry) {
			const btnDel = footer.createEl("button", { text: "Borrar Entrada", cls: "mod-warning" });
			btnDel.onclick = async () => {
				await deleteEntry(this.storage, this.habit.id, this.date);
				this.onDelete();
				this.close();
			};
		}

		const btnSave = footer.createEl("button", { text: "Guardar", cls: "mod-cta" });
		btnSave.onclick = async () => {
			const val = this.habit.type === "yesno" ? this.yesNoValue : this.quantValue;
			const s = this.storage.getData().settingsSnapshot;

			// Mapeo de settings
			const noteSettings: NoteSettings = {
				folder: s.notesFolder || "Habit Logs",
				filenamePattern: s.noteFilenamePattern,
				template: s.noteTemplate,
				openAfterCreate: s.openNoteAfterCreate,
				askBeforeCreate: s.askBeforeCreateNote
			};

			// Actualizar/Crear Log Mensual
			const notePath = await createHabitNote(this.app, noteSettings, this.habit, this.date, String(val), this.notes, this.moodValue);

			await setEntry(this.storage, this.habit.id, this.date, val, notePath, {
				energy: this.energyValue,
				mood: this.moodValue,
				notes: this.notes.trim() || undefined
			});

			this.onSave({ value: val, notePath });
			this.close();
		};
	}

	onClose() { this.contentEl.empty(); }
}