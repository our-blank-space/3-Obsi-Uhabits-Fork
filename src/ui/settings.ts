import { App, Plugin, PluginSettingTab, Setting, Notice } from "obsidian";
import { HabitStorage } from "../core/storage";
import { generateMonthlyReport } from "../utils/reports";
import { exportJsonBackup, exportCsv, importJsonBackup, repairDatabase } from "../utils/backup";

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

		containerEl.createEl("h2", { text: "Habit Loop – Configuración" });

		// --- Notas ---
		new Setting(containerEl).setHeading().setName("Notas y Registros");

		new Setting(containerEl)
			.setName("Carpeta de notas")
			.addText(t => t.setValue(s.notesFolder).onChange(async v => {
				s.notesFolder = v; await this.storage.save();
			}));

		new Setting(containerEl)
			.setName("Abrir nota al crear")
			.addToggle(t => t.setValue(s.openNoteAfterCreate).onChange(async v => {
				s.openNoteAfterCreate = v; await this.storage.save();
			}));

		// --- Interfaz ---
		new Setting(containerEl).setHeading().setName("Interfaz");

		new Setting(containerEl)
			.setName("Orientación")
			.addDropdown(d => d
				.addOption("recent-right", "Recientes derecha (→)")
				.addOption("recent-left", "Recientes izquierda (←)")
				.setValue(s.dayBarOrientation)
				.onChange(async v => {
					s.dayBarOrientation = v as any; await this.storage.save();
				}));

		new Setting(containerEl)
			.setName("Ocultar completados hoy")
			.addToggle(t => t.setValue(s.autoHideCompletedToday).onChange(async v => {
				s.autoHideCompletedToday = v; await this.storage.save();
			}));

		// --- Datos ---
		new Setting(containerEl).setHeading().setName("Datos y Mantenimiento");

		new Setting(containerEl).setName("Backups")
			.addButton(b => b.setButtonText("Exportar JSON").onClick(async () => {
				await exportJsonBackup(this.app, this.storage);
				new Notice("Backup JSON creado.");
			}))
			.addButton(b => b.setButtonText("Exportar CSV").onClick(async () => {
				await exportCsv(this.app, this.storage);
				new Notice("Backup CSV creado.");
			}));

        let importPath = "";
        new Setting(containerEl).setName("Restaurar")
            .setDesc("Ruta del archivo JSON")
            .addText(t => t.setPlaceholder("Habit Backups/backup.json").onChange(v => importPath = v))
            .addButton(b => b.setButtonText("Importar").setWarning().onClick(async () => {
                if(importPath) {
                    try {
                        await importJsonBackup(this.app, this.storage, importPath);
                        new Notice("Restaurado con éxito.");
                    } catch(e) { new Notice("Error al importar."); }
                }
            }));

        new Setting(containerEl).setName("Mantenimiento")
            .addButton(b => b.setButtonText("Reparar DB").onClick(async () => {
                await repairDatabase(this.storage);
                new Notice("Base de datos reparada.");
            }));
	}
}