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
	dayBarOrientation: "recent-left",
	autoHideCompletedToday: false,
	soundsEnabled: false,
	backupFolder: "Habit Backups",
	sortMode: "manual",
	daysVisible: 21,
	showDailyProgress: true,
	confirmArchive: true,
	language: "auto"
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
		// Save only metadata in the main file
		await this.plugin.saveData(this.data);
		this.events.trigger("changed", this.data);
	}

	getData(): HabitData {
		return this.data;
	}

	/**
	 * Loads entries for a habit on demand
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
	 * Synchronous version for UI (requires pre-loading)
	 */
	getEntriesSync(habitId: string): HabitEntries {
		return this.entriesCache.get(habitId) ?? { entries: {} };
	}

	/**
	 * Saves entries for a habit independently
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

	/**
	 * Forces an events trigger to refresh the UI
	 */
	refresh() {
		this.events.trigger("changed", this.data);
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

		// Migration to version 2 (Modular)
		if (v.version < 2) {
			console.log("Migrating Habit Loop to modular storage...");
			const habitsWithData = v.habits || [];
			const newHabits: Habit[] = [];

			for (const h of habitsWithData) {
				const { entries, ...metadata } = h;

				// Save entries in their own file
				await this.modular.saveHabitData(h.id, { entries: entries || {} });

				// Save only metadata
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
