import { App, Plugin, PluginSettingTab, Setting, Notice } from "obsidian";
import { HabitStorage } from "../core/storage";
import { generateMonthlyReport } from "../utils/reports";
import { exportJsonBackup, exportCsv, importJsonBackup, repairDatabase } from "../utils/backup";
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
        const lang = s.language;

		containerEl.createEl("h2", { text: t("settings-title", lang) });

		// --- Notas ---
		new Setting(containerEl).setHeading().setName(t("settings-notes-heading", lang));

		new Setting(containerEl)
			.setName(t("settings-notes-folder", lang))
			.addText(t => t.setValue(s.notesFolder).onChange(async v => {
				s.notesFolder = v; await this.storage.save();
			}));

		new Setting(containerEl)
			.setName(t("settings-open-note", lang))
			.addToggle(toggle => toggle.setValue(s.openNoteAfterCreate).onChange(async v => {
				s.openNoteAfterCreate = v; await this.storage.save();
			}));

		// --- Interfaz ---
		new Setting(containerEl).setHeading().setName(t("settings-interface-heading", lang));

        new Setting(containerEl)
            .setName(t("settings-language", lang))
            .addDropdown(d => d
                .addOption("auto", t("settings-language-auto", lang))
                .addOption("en", "English")
                .addOption("es", "Español")
                .setValue(s.language || "auto")
                .onChange(async v => {
                    s.language = v as any; 
                    await this.storage.save();
                    this.display(); // Refresh to update labels
                }));

		new Setting(containerEl)
			.setName(t("settings-orientation", lang))
			.addDropdown(d => d
				.addOption("recent-right", t("settings-orient-right", lang))
				.addOption("recent-left", t("settings-orient-left", lang))
				.setValue(s.dayBarOrientation)
				.onChange(async v => {
					s.dayBarOrientation = v as any; await this.storage.save();
				}));

		new Setting(containerEl)
			.setName(t("settings-hide-completed", lang))
			.addToggle(toggle => toggle.setValue(s.autoHideCompletedToday).onChange(async v => {
				s.autoHideCompletedToday = v; await this.storage.save();
			}));

		// --- Datos ---
		new Setting(containerEl).setHeading().setName(t("settings-data-heading", lang));

		new Setting(containerEl).setName("Backups")
			.addButton(b => b.setButtonText(t("settings-export-json", lang)).onClick(async () => {
				await exportJsonBackup(this.app, this.storage);
				new Notice("Backup JSON creado.");
			}))
			.addButton(b => b.setButtonText(t("settings-export-csv", lang)).onClick(async () => {
				await exportCsv(this.app, this.storage);
				new Notice("Backup CSV creado.");
			}));

        let importPath = "";
        new Setting(containerEl).setName(t("settings-import", lang))
            .setDesc(t("settings-import-desc", lang))
            .addText(t => t.setPlaceholder("Habit Backups/backup.json").onChange(v => importPath = v))
            .addButton(b => b.setButtonText(t("settings-import", lang)).setWarning().onClick(async () => {
                if(importPath) {
                    try {
                        await importJsonBackup(this.app, this.storage, importPath);
                        new Notice("Restaurado con éxito.");
                    } catch(e) { new Notice("Error al importar."); }
                }
            }));

        new Setting(containerEl).setName("Mantenimiento")
            .addButton(b => b.setButtonText(t("settings-repair", lang)).onClick(async () => {
                await repairDatabase(this.storage);
                new Notice("Base de datos reparada.");
            }));
	}
}