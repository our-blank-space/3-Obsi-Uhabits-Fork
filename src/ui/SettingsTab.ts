import { App, Plugin, PluginSettingTab, Setting, Notice } from "obsidian";
// CORRECCIÓN: Nombre correcto de la clase de almacenamiento
import { HabitStorage } from "../core/storage";
import { generateMonthlyReport } from "../utils/reports";
// CORRECCIÓN: Nombres correctos de las funciones exportadas en backup.ts
import { exportJsonBackup, exportCsv, importJsonBackup } from "../utils/backup";

export class HabitSettingsTab extends PluginSettingTab {
    // CORRECCIÓN: Tipo correcto
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

		// --- SECCIÓN: NOTAS ---
		new Setting(containerEl).setHeading().setName("Notas y Registros");

		new Setting(containerEl)
			.setName("Carpeta de notas")
			.setDesc("Donde se guardarán las notas individuales de cada registro.")
			.addText(t => t
				.setValue(s.notesFolder)
				.onChange(async v => {
					s.notesFolder = v;
					await this.storage.save();
				}));

		new Setting(containerEl)
			.setName("Plantilla de nota")
			.setDesc("Variables disponibles: {{habit}}, {{date:YYYY-MM-DD}}, {{value}}, {{notes}}")
			.addTextArea(t => t
				.setValue(s.noteTemplate)
				.onChange(async v => {
					s.noteTemplate = v;
					await this.storage.save();
				}));

		new Setting(containerEl)
			.setName("Abrir nota al crear")
			.addToggle(t => t
				.setValue(s.openNoteAfterCreate)
				.onChange(async v => {
					s.openNoteAfterCreate = v;
					await this.storage.save();
				}));
        
        new Setting(containerEl)
            .setName("Preguntar antes de crear")
            .addToggle(t => t
                .setValue(s.askBeforeCreateNote)
                .onChange(async v => {
                    s.askBeforeCreateNote = v;
                    await this.storage.save();
                }));

		// --- SECCIÓN: INTERFAZ ---
		new Setting(containerEl).setHeading().setName("Interfaz");

		new Setting(containerEl)
			.setName("Orientación de la barra de días")
			.addDropdown(d => d
				.addOption("recent-right", "Recientes a la derecha (→)")
				.addOption("recent-left", "Recientes a la izquierda (←)")
				.setValue(s.dayBarOrientation)
				.onChange(async v => {
					s.dayBarOrientation = v as any;
					await this.storage.save();
				}));

		new Setting(containerEl)
			.setName("Primer día de la semana")
			.addDropdown(d => d
				.addOption("Mon", "Lunes")
				.addOption("Sun", "Domingo")
				.setValue(s.firstDayOfWeek)
				.onChange(async v => {
					s.firstDayOfWeek = v as any;
					await this.storage.save();
				}));

		new Setting(containerEl)
			.setName("Días visibles en el grid")
			.setDesc("Cuántos días hacia atrás mostrar en la vista principal.")
			.addText(t => t
				.setValue(String(s.daysVisible))
				.onChange(async v => {
					const num = parseInt(v);
					if (!isNaN(num) && num > 0) {
						s.daysVisible = num;
						await this.storage.save();
					}
				}));

		new Setting(containerEl)
			.setName("Ocultar completados hoy")
			.setDesc("Limpia la vista principal ocultando lo que ya hiciste hoy.")
			.addToggle(t => t
				.setValue(s.autoHideCompletedToday)
				.onChange(async v => {
					s.autoHideCompletedToday = v;
					await this.storage.save();
				}));

		new Setting(containerEl)
			.setName("Confirmar al archivar")
			.setDesc("Pide confirmación antes de mover un hábito a archivados.")
			.addToggle(t => t
				.setValue(s.confirmArchive)
				.onChange(async v => {
					s.confirmArchive = v;
					await this.storage.save();
				}));

		// --- SECCIÓN: DATOS & BACKUP ---
		new Setting(containerEl).setHeading().setName("Datos y Mantenimiento");

		new Setting(containerEl)
			.setName("Carpeta de Backups")
			.addText(t => t
				.setValue(s.backupFolder)
				.onChange(async v => {
					s.backupFolder = v;
					await this.storage.save();
				}));

		new Setting(containerEl)
			.setName("Exportar")
			.setDesc("Genera archivos en tu bóveda.")
			.addButton(b => b
				.setButtonText("JSON Backup")
				.onClick(async () => {
					const p = await exportJsonBackup(this.app, this.storage);
					new Notice(`Backup creado: ${p}`);
				}))
			.addButton(b => b
				.setButtonText("CSV Logs")
				.onClick(async () => {
					const p = await exportCsv(this.app, this.storage);
					new Notice(`CSV creado: ${p}`);
				}));

        new Setting(containerEl)
            .setName("Generar Reporte Mensual")
            .setDesc("Crea un resumen Markdown del mes actual.")
            .addButton(b => b
                .setButtonText("Generar Reporte")
                .onClick(async () => {
                    const p = await generateMonthlyReport(this.app, this.storage);
                    new Notice(`Reporte: ${p}`);
                }));

		// Importación
		let importPath = "";
		new Setting(containerEl)
			.setName("Importar JSON")
			.setDesc("⚠️ Sobrescribe todos los datos actuales.")
			.addText(t => t
				.setPlaceholder("Ruta/al/backup.json")
				.onChange(v => importPath = v))
			.addButton(b => b
				.setButtonText("Restaurar")
				.setWarning()
				.onClick(async () => {
					if(!importPath) return new Notice("Define la ruta del archivo.");
					try {
						await importJsonBackup(this.app, this.storage, importPath);
						new Notice("Datos restaurados correctamente.");
					} catch(e) {
						new Notice("Error al importar. Verifica la ruta.");
						console.error(e);
					}
				}));
                
        new Setting(containerEl)
            .setName("Reparar Base de Datos")
            .setDesc("Intenta arreglar inconsistencias en data.json.")
            .addButton(b => b
                .setButtonText("Reparar")
                .onClick(async () => {
                    await this.storage.repairData();
                    new Notice("Reparación completada.");
                }));
	}
}