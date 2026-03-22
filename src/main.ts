import { Plugin, WorkspaceLeaf } from "obsidian";
import { HabitStorage } from "./core/storage";
import { HomeView, HABIT_VIEW_TYPE } from "./ui/views/HomeView";
import { HabitSettingsTab } from "./ui/settings";
import { CreateHabitModal } from "./ui/modals/CreateHabitModal";
import { exportJsonBackup } from "./utils/backup";
import { todayString, addDays, compareDateStr } from "./utils/dates";
import { t } from "./i18n";

export default class HabitTrackerPlugin extends Plugin {
	storage!: HabitStorage;

	async onload() {
		console.log("Loading Habit Loop Tracker...");

		// 1. Load Storage
		this.storage = new HabitStorage(this);
		await this.storage.load();

		// 1b. Weekly Automatic Backup
		await this.checkAutomaticBackup();

		// 2. Register View
		this.registerView(
			HABIT_VIEW_TYPE,
			(leaf) => new HomeView(leaf, this.storage)
		);

		// 3. Ribbon
		this.addRibbonIcon("check-circle-2", "Habit Tracker", () => {
			this.activateView();
		});

		// 4. Commands
		this.addCommand({
			id: "open-habit-tracker",
			name: t("dashboard"), // "Abrir Habit Tracker"
			callback: () => this.activateView()
		});

		this.addCommand({
			id: "create-new-habit",
			name: t("create-habit"), // "Create New Habit"
			callback: () => {
				new CreateHabitModal(this.app, this.storage).open();
			}
		});

		// 5. Settings
		this.addSettingTab(new HabitSettingsTab(this.app, this, this.storage));
	}

	async onunload() {
		this.app.workspace.detachLeavesOfType(HABIT_VIEW_TYPE);
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(HABIT_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) await leaf.setViewState({ type: HABIT_VIEW_TYPE, active: true });
		}

		if (leaf) workspace.revealLeaf(leaf);
	}

	private async checkAutomaticBackup() {
		const data = this.storage.getData();
		const today = todayString();
		const last = data.lastBackup;

		// If never backed up or was more than 7 days ago
		if (!last || compareDateStr(addDays(last, 7), today) <= 0) {
			console.log("Starting automatic weekly backup...");
			try {
				await exportJsonBackup(this.app, this.storage);
				await this.storage.update(d => d.lastBackup = today);
			} catch (e) {
				console.error("Automatic backup error:", e);
			}
		}
	}
}