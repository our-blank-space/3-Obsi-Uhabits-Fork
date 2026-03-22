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
		const lang = s.language || "auto";

		containerEl.createEl("h2", { text: t("settings-title", lang) });

		// --- Notes ---
		new Setting(containerEl).setHeading().setName(t("settings-notes-heading", lang));

		new Setting(containerEl)
			.setName(t("settings-notes-folder", lang))
			.setDesc(t("settings-notes-desc", lang))
			.addText(text => text.setValue(s.notesFolder).onChange(async v => {
				s.notesFolder = v; await this.storage.save();
			}));

		new Setting(containerEl)
			.setName(t("settings-open-note", lang))
			.addToggle(toggle => toggle.setValue(s.openNoteAfterCreate).onChange(async v => {
				s.openNoteAfterCreate = v; await this.storage.save();
			}));

		// --- Interface ---
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
			.setDesc(t("settings-orientation-desc", lang))
			.addDropdown(d => d
				.addOption("recent-left", t("settings-orient-left", lang))
				.addOption("recent-right", t("settings-orient-right", lang))

				.setValue(s.dayBarOrientation)
				.onChange(async v => {
					s.dayBarOrientation = v as any; await this.storage.save();
				}));

		new Setting(containerEl)
			.setName(t("settings-hide-completed", lang))
			.addToggle(toggle => toggle.setValue(s.autoHideCompletedToday).onChange(async v => {
				s.autoHideCompletedToday = v; await this.storage.save();
			}));

		// --- Data ---
		new Setting(containerEl).setHeading().setName(t("settings-data-heading", lang));

		new Setting(containerEl).setName("Backups")
			.addButton(b => b.setButtonText(t("settings-export-json", lang)).onClick(async () => {
				await exportJsonBackup(this.app, this.storage);
				new Notice(t("export-success", lang));
			}))
			.addButton(b => b.setButtonText(t("settings-export-csv", lang)).onClick(async () => {
				await exportCsv(this.app, this.storage);
				new Notice(t("export-success", lang));
			}));

		let importPath = "";
		new Setting(containerEl).setName(t("settings-import", lang))
			.setDesc(t("settings-import-warn", lang))
			.addText(text => text.setPlaceholder(t("settings-import-desc", lang)).onChange(v => importPath = v))
			.addButton(b => b.setButtonText(t("settings-import", lang)).setWarning().onClick(async () => {
				if (importPath) {
					try {
						await importJsonBackup(this.app, this.storage, importPath);
						new Notice(t("save-success", lang));
						this.display();
					} catch (e) { new Notice(t("save-error", lang)); }
				}
			}));

		containerEl.createDiv({ cls: "settings-spacer" });

		new Setting(containerEl)
			.setName(t("settings-repair", lang))
			.setDesc(t("settings-repair-desc", lang))
			.addButton(b => b.setButtonText(t("settings-repair", lang)).onClick(async () => {
				await repairDatabase(this.storage);
				new Notice(t("save-success", lang));
			}));

		// --- Support ---
		new Setting(containerEl).setHeading().setName(t("settings-support-heading", lang));

		new Setting(containerEl)
			.setName(t("settings-support-repo", lang))
			.setDesc(t("settings-support-repo-desc", lang))
			.addButton(b => b.setButtonText(t("open-github", lang)).onClick(() => {
				window.open("https://github.com/our-blank-space/3-Obsi-Uhabits-Fork");
			}));

		new Setting(containerEl)
			.setName(t("settings-support-readme", lang))
			.setDesc(t("settings-support-readme-desc", lang))
			.addButton(b => b.setButtonText(t("view-readme", lang)).onClick(() => {
				window.open("https://github.com/our-blank-space/3-Obsi-Uhabits-Fork/blob/main/README.md");
			}));
	}
}