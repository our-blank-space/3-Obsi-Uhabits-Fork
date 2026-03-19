import { App, Modal, Setting, TextComponent, SliderComponent, TextAreaComponent, Notice } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { Habit, HabitEntry } from "../../core/types";
import { setEntry, deleteEntry, evalHabitEntry } from "../../core/entries";
import { createHabitNote, NoteSettings } from "../../utils/notes";
import { t } from "../../i18n";

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
	private showContext: boolean = false;
    private lang: any;

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
		this.notes = this.entry?.notes ?? "";

		// Auto-expandir si ya hay datos
		if (this.entry?.notes || this.entry?.mood || this.entry?.energy) {
			this.showContext = true;
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("habit-entry-modal");

        const settings = this.storage.getData().settingsSnapshot;
        this.lang = settings.language;
        const lang = this.lang;

		contentEl.createEl("h2", { text: this.habit.name });
		
		const subHeader = contentEl.createDiv("ht-modal-subheader");
		subHeader.createSpan({ cls: "ht-entry-date-label", text: t("entry-for", lang) });
		subHeader.createSpan({ cls: "ht-entry-date", text: this.date });

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
			new Setting(contentEl).setName(t("value", lang))
				.setDesc(this.habit.goal ? `${t("goal", lang)}: ${this.habit.goal.value}` : "")
				.addText((text: TextComponent) => {
					text.inputEl.type = "number";
					text.setValue(String(this.quantValue))
						.onChange((v: string) => this.quantValue = Number(v));
                    text.inputEl.focus();
				});
		}

		// --- Contexto (Opcional/Colapsable) ---
		const contextToggle = contentEl.createEl("button", { 
			text: this.showContext ? t("entry-hide-details", lang) : t("entry-show-details", lang), 
			cls: "ht-btn ht-context-toggle" 
		});
		
		const contextArea = contentEl.createDiv("ht-context-area");
		if (!this.showContext) contextArea.style.display = "none";

		contextToggle.onclick = () => {
			this.showContext = !this.showContext;
			contextArea.style.display = this.showContext ? "block" : "none";
			contextToggle.setText(this.showContext ? t("entry-hide-details", lang) : t("entry-show-details", lang));
		};

		const energyContainer = contextArea.createDiv("ht-context-row");
		new Setting(energyContainer)
			.setName(t("entry-energy-desc", lang))
			.addSlider((slider: SliderComponent) => slider
				.setLimits(1, 5, 1)
				.setValue(this.energyValue)
				.setDynamicTooltip()
				.onChange((v: number) => this.energyValue = v)
			);

		const moodContainer = contextArea.createDiv("ht-mood-selector");
		const moods = ["😫", "😔", "😑", "🙂", "🔥"];
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
		new Setting(contextArea).setName(t("entry-notes", lang))
			.addTextArea((text: TextAreaComponent) => {
				text.setPlaceholder(t("entry-placeholder", lang))
					.setValue(this.notes)
					.onChange((v: string) => this.notes = v);
                
                // Shortcut local para el textarea
                text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        this.submit();
                    }
                });
			});

		// --- Footer ---
		const footer = contentEl.createDiv("habit-modal-footer");

		if (this.entry) {
			const btnDel = footer.createEl("button", { text: t("entry-delete", lang), cls: "mod-warning" });
			btnDel.onclick = async () => {
				await deleteEntry(this.storage, this.habit.id, this.date);
				this.onDelete();
				this.close();
			};
		}

		const btnSave = footer.createEl("button", { text: t("save", lang), cls: "mod-cta" });
		btnSave.onclick = () => this.submit();

        // Keyboard Shortcut general (si no está en el textarea)
        const kbHandler = (e: KeyboardEvent) => {
            if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
                e.preventDefault();
                this.submit();
            }
        };
        contentEl.addEventListener("keydown", kbHandler);

        this.onClose = () => {
            contentEl.removeEventListener("keydown", kbHandler);
            contentEl.empty();
        };
	}

    private async submit() {
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
        const notePath = await createHabitNote(this.app, noteSettings, this.habit, this.date, String(val), this.notes, this.moodValue, this.lang);

        await setEntry(this.storage, this.habit.id, this.date, val, notePath, {
            energy: this.energyValue,
            mood: this.moodValue,
            notes: this.notes.trim() || undefined
        });

        this.onSave({ value: val, notePath });
        this.close();
    }
}