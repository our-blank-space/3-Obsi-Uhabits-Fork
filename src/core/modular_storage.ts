import { Plugin, TFile, normalizePath } from "obsidian";
import { HabitEntries } from "./types";

export class ModularStorage {
    private plugin: Plugin;
    private dataFolder: string;

    constructor(plugin: Plugin, dataFolder: string = "data") {
        this.plugin = plugin;
        this.dataFolder = dataFolder;
    }

    private getPath(habitId: string): string {
        return normalizePath(`${this.plugin.manifest.dir}/${this.dataFolder}/habit_${habitId}.json`);
    }

    async ensureFolder() {
        const folderPath = normalizePath(`${this.plugin.manifest.dir}/${this.dataFolder}`);
        if (!(await this.plugin.app.vault.adapter.exists(folderPath))) {
            await this.plugin.app.vault.adapter.mkdir(folderPath);
        }
    }

    async loadHabitData(habitId: string): Promise<HabitEntries | null> {
        const path = this.getPath(habitId);
        if (!(await this.plugin.app.vault.adapter.exists(path))) {
            return null;
        }
        try {
            const content = await this.plugin.app.vault.adapter.read(path);
            return JSON.parse(content);
        } catch (e) {
            console.error(`Error loading habit data for ${habitId}:`, e);
            return null;
        }
    }

    async saveHabitData(habitId: string, data: HabitEntries): Promise<void> {
        await this.ensureFolder();
        const path = this.getPath(habitId);
        await this.plugin.app.vault.adapter.write(path, JSON.stringify(data, null, 2));
    }

    async deleteHabitData(habitId: string): Promise<void> {
        const path = this.getPath(habitId);
        if (await this.plugin.app.vault.adapter.exists(path)) {
            await this.plugin.app.vault.adapter.remove(path);
        }
    }
}
