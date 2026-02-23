import { Plugin, Events } from "obsidian";
import { HabitData, HabitPluginSettings, Habit, HabitEntries } from "./types";
import { ModularStorage } from "./modular_storage";

const CURRENT_DATA_VERSION = 2; // Incrementar para migración modular

const DEFAULT_SETTINGS: HabitPluginSettings = {
	firstDayOfWeek: "Mon",
	notesFolder: "Habit Logs",
	openNoteAfterCreate: false,
	askBeforeCreateNote: false,
	noteFilenamePattern: "{{date:YYYY-MM-DD}} - {{habit}}",
	noteTemplate: "---\ntype: habit-log\n---\n# {{habit}}\n{{notes}}",
	reportsFolder: "Habit Logs",
	dayBarOrientation: "recent-right",
	autoHideCompletedToday: false,
	soundsEnabled: false,
	backupFolder: "Habit Backups",
	sortMode: "manual"
};

export class HabitStorage {
	private plugin: Plugin;
	private data: HabitData;
	private modular: ModularStorage;
	private entriesCache: Map<string, HabitEntries> = new Map();

	public events = new Events();

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.data = this.getEmptyData();
		this.modular = new ModularStorage(plugin);
	}

	async load(): Promise<HabitData> {
		const raw = await this.plugin.loadData();
		if (!raw) {
			this.data = this.getEmptyData();
			await this.save();
			return this.data;
		}
		this.data = await this.migrate(raw);
		return this.data;
	}

	async save(): Promise<void> {
		// Guardar solo metadatos en el archivo principal
		await this.plugin.saveData(this.data);
		this.events.trigger("changed", this.data);
	}

	getData(): HabitData {
		return this.data;
	}

	/**
	 * Carga las entradas de un hábito bajo demanda
	 */
	async getEntries(habitId: string): Promise<HabitEntries> {
		if (this.entriesCache.has(habitId)) {
			return this.entriesCache.get(habitId)!;
		}

		const data = await this.modular.loadHabitData(habitId);
		const entries = data ?? { entries: {} };
		this.entriesCache.set(habitId, entries);
		return entries;
	}

	/**
	 * Versión síncrona para UI (requiere pre-carga)
	 */
	getEntriesSync(habitId: string): HabitEntries {
		return this.entriesCache.get(habitId) ?? { entries: {} };
	}

	/**
	 * Guarda las entradas de un hábito de forma independiente
	 */
	async saveEntries(habitId: string, data: HabitEntries): Promise<void> {
		this.entriesCache.set(habitId, data);
		await this.modular.saveHabitData(habitId, data);
		this.events.trigger("habit-data-changed", habitId);
	}

	async update(mutator: (d: HabitData) => void): Promise<void> {
		mutator(this.data);
		await this.save();
	}

	private getEmptyData(): HabitData {
		return {
			version: CURRENT_DATA_VERSION,
			habits: [],
			settingsSnapshot: { ...DEFAULT_SETTINGS }
		};
	}

	private async migrate(raw: any): Promise<HabitData> {
		const v: any = raw ?? {};

		// Migración a versión 2 (Modular)
		if (v.version < 2) {
			console.log("Migrando Habit Loop a almacenamiento modular...");
			const habitsWithData = v.habits || [];
			const newHabits: Habit[] = [];

			for (const h of habitsWithData) {
				const { entries, ...metadata } = h;

				// Guardar entries en su propio archivo
				await this.modular.saveHabitData(h.id, { entries: entries || {} });

				// Guardar solo metadatos
				newHabits.push(metadata);
			}

			v.habits = newHabits;
			v.version = CURRENT_DATA_VERSION;
			await this.plugin.saveData(v);
		}

		if (!Array.isArray(v.habits)) v.habits = [];
		v.settingsSnapshot = { ...DEFAULT_SETTINGS, ...v.settingsSnapshot };
		v.habits.forEach((h: Habit, idx: number) => {
			if (h.order == null) h.order = idx;
		});
		return v as HabitData;
	}

	async repairData() {
		this.data = await this.migrate(this.data);
		await this.save();
	}

	async importFromRaw(raw: any) {
		const data = await this.migrate(raw);
		this.data = data;
		await this.save();
	}
}
