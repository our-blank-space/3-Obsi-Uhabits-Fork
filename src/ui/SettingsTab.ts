import { App, Plugin, PluginSettingTab, Setting, Notice } from "obsidian";
import { HabitStorage } from "../core/storage";
import { generateMonthlyReport } from "../utils/reports";
import { exportJsonBackup, exportCsv, importJsonBackup } from "../utils/backup";
import { t } from "../i18n";

export class HabitSettingsTab extends PluginSettingTab {
	storage: HabitStorage;

	constructor(app: App, plugin: Plugin, storage: HabitStorage) {
		super(app, plugin);
		this.storage = storage;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const data = this.storage.getData();
		const s = data.settingsSnapshot;

		containerEl.createEl("h2", { text: t("settings-title") });

		// --- SECCIÓN: NOTAS ---
		new Setting(containerEl).setHeading().setName(t("settings-notes-heading"));

		new Setting(containerEl)
			.setName(t("settings-notes-folder"))
			.setDesc(t("settings-notes-desc"))
			.addText(text => text
				.setValue(s.notesFolder)
				.onChange(async v => {
					s.notesFolder = v;
					await this.storage.save();
				}));

		new Setting(containerEl)
			.setName(t("settings-template"))
			.setDesc(t("settings-template-desc"))
			.addTextArea(area => area
				.setValue(s.noteTemplate)
				.onChange(async v => {
					s.noteTemplate = v;
					await this.storage.save();
				}));

		new Setting(containerEl)
			.setName(t("settings-open-note"))
			.addToggle(toggle => toggle
				.setValue(s.openNoteAfterCreate)
				.onChange(async v => {
					s.openNoteAfterCreate = v;
					await this.storage.save();
				}));
        
        new Setting(containerEl)
            .setName(t("settings-ask-create"))
            .addToggle(toggle => toggle
                .setValue(s.askBeforeCreateNote)
                .onChange(async v => {
                    s.askBeforeCreateNote = v;
                    await this.storage.save();
                }));

		// --- SECCIÓN: INTERFAZ ---
		new Setting(containerEl).setHeading().setName(t("settings-interface-heading"));

		new Setting(containerEl)
			.setName(t("settings-orientation"))
			.setDesc(t("settings-orientation-desc"))
			.addDropdown(d => d
				.addOption("recent-right", t("settings-orient-right"))
				.addOption("recent-left", t("settings-orient-left"))
				.setValue(s.dayBarOrientation)
				.onChange(async v => {
					s.dayBarOrientation = v as any;
					await this.storage.save();
				}));

		new Setting(containerEl)
			.setName(t("settings-first-day"))
			.addDropdown(d => d
				.addOption("Mon", t("weekdays")[1])
				.addOption("Sun", t("weekdays")[0])
				.setValue(s.firstDayOfWeek)
				.onChange(async v => {
					s.firstDayOfWeek = v as any;
					await this.storage.save();
				}));

		new Setting(containerEl)
			.setName(t("settings-days-visible"))
			.setDesc(t("settings-days-visible-desc"))
			.addText(text => text
				.setValue(String(s.daysVisible))
				.onChange(async v => {
					const num = parseInt(v);
					if (!isNaN(num) && num > 0) {
						s.daysVisible = num;
						await this.storage.save();
					}
				}));

		new Setting(containerEl)
			.setName(t("settings-hide-completed"))
			.setDesc(t("settings-hide-completed")) // Utiliza la misma frase para descripción si no hay específica
			.addToggle(toggle => toggle
				.setValue(s.autoHideCompletedToday)
				.onChange(async v => {
					s.autoHideCompletedToday = v;
					await this.storage.save();
				}));

		new Setting(containerEl)
			.setName(t("settings-confirm-archive"))
			.setDesc(t("settings-confirm-archive-desc"))
			.addToggle(toggle => toggle
				.setValue(s.confirmArchive)
				.onChange(async v => {
					s.confirmArchive = v;
					await this.storage.save();
				}));

		// --- SECCIÓN: DATOS & BACKUP ---
		new Setting(containerEl).setHeading().setName(t("settings-data-heading"));

		new Setting(containerEl)
			.setName(t("settings-backup-folder"))
			.addText(text => text
				.setValue(s.backupFolder)
				.onChange(async v => {
					s.backupFolder = v;
					await this.storage.save();
				}));

		new Setting(containerEl)
			.setName(t("settings-export"))
			.setDesc(t("settings-export-desc"))
			.addButton(b => b
				.setButtonText(t("settings-export-json"))
				.onClick(async () => {
					const p = await exportJsonBackup(this.app, this.storage);
					new Notice(`${t("export-success")}: ${p}`);
				}))
			.addButton(b => b
				.setButtonText(t("settings-export-csv"))
				.onClick(async () => {
					const p = await exportCsv(this.app, this.storage);
					new Notice(`${t("export-success")}: ${p}`);
				}));

        new Setting(containerEl)
            .setName(t("settings-report"))
            .setDesc(t("settings-report-desc"))
            .addButton(b => b
                .setButtonText(t("settings-report"))
                .onClick(async () => {
                    const p = await generateMonthlyReport(this.app, this.storage);
                    new Notice(`${t("export-success")}: ${p}`);
                }));

		// Importación
		let importPath = "";
		new Setting(containerEl)
			.setName(t("settings-import"))
			.setDesc(t("settings-import-warn"))
			.addText(text => text
				.setPlaceholder(t("settings-import-desc"))
				.onChange(v => importPath = v))
			.addButton(b => b
				.setButtonText(t("settings-import"))
				.setWarning()
				.onClick(async () => {
					if(!importPath) return new Notice(t("settings-import-desc"));
					try {
						await importJsonBackup(this.app, this.storage, importPath);
						new Notice(t("save-success"));
					} catch(e) {
						new Notice(t("save-error"));
						console.error(e);
					}
				}));
                
        new Setting(containerEl)
            .setName(t("settings-repair"))
            .setDesc(t("settings-repair-desc"))
            .addButton(b => b
                .setButtonText(t("settings-repair"))
                .onClick(async () => {
                    await this.storage.repairData();
                    new Notice(t("save-success"));
                }));

		// --- SECCIÓN: SOPORTE ---
		new Setting(containerEl).setHeading().setName(t("settings-support-heading"));

		new Setting(containerEl)
			.setName(t("settings-support-repo"))
			.setDesc(t("settings-support-repo-desc"))
			.addButton(b => b
				.setButtonText(t("open-github"))
				.onClick(() => {
					window.open("https://github.com/our-blank-space/3-Obsi-Uhabits-Fork");
				}));

		new Setting(containerEl)
			.setName(t("settings-support-readme"))
			.setDesc(t("settings-support-readme-desc"))
			.addButton(b => b
				.setButtonText(t("view-readme"))
				.onClick(() => {
					window.open("https://github.com/our-blank-space/3-Obsi-Uhabits-Fork/blob/main/README.md");
				}));
	}
}