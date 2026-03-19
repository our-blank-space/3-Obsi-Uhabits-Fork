import { App, Modal, Notice } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { restoreHabit, deleteHabit } from "../../core/habits";
import { t } from "../../i18n";

export class ArchivedHabitsModal extends Modal {
    storage: HabitStorage;
    onRestore: () => void;

    constructor(app: App, storage: HabitStorage, onRestore: () => void) {
        super(app);
        this.storage = storage;
        this.onRestore = onRestore;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("habit-modal");

        const settings = this.storage.getData().settingsSnapshot;
        const lang = settings.language;

        contentEl.createEl("h2", { text: t("archived-habits", lang) });

        const archived = this.storage.getData().habits.filter(h => h.archived);

        if (archived.length === 0) {
            contentEl.createDiv({ text: t("no-archived-habits", lang), cls: "ht-empty" });
            return;
        }

        const list = contentEl.createDiv("ht-archived-list");

        archived.forEach(habit => {
            const item = list.createDiv("ht-archived-item");
            item.style.display = "flex";
            item.style.justifyContent = "space-between";
            item.style.alignItems = "center";
            item.style.padding = "10px";
            item.style.borderBottom = "1px solid var(--background-modifier-border)";

            const info = item.createDiv();
            info.createDiv({ 
                text: habit.name, 
                attr: { style: "font-weight:bold" } 
            });
            
            const actions = item.createDiv({ 
                cls: "ht-archived-actions", 
                attr: { style: "display:flex; gap:8px;" }
            });

            // Botón Restaurar
            const btnRestore = actions.createEl("button", { text: t("restore", lang) });
            btnRestore.onclick = async () => {
                await restoreHabit(this.storage, habit.id);
                new Notice(`${t("habit-restored", lang)}: "${habit.name}"`);
                this.onRestore();
                this.onOpen();
            };

            // Botón Eliminar Definitivamente
            const btnDel = actions.createEl("button", { text: t("delete", lang), cls: "mod-warning" });
            btnDel.onclick = async () => {
                if(confirm(t("confirm-delete-permanent", lang))) {
                    await deleteHabit(this.storage, habit.id);
                    this.onOpen();
                }
            };
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}