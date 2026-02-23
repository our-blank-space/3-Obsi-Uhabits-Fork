import { App, Modal, Notice } from "obsidian";
import { HabitStorage } from "../../core/storage";
import { restoreHabit, deleteHabit } from "../../core/habits";

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
        contentEl.createEl("h2", { text: "Hábitos Archivados" });

        const archived = this.storage.getData().habits.filter(h => h.archived);

        if (archived.length === 0) {
            contentEl.createDiv({ text: "No hay hábitos archivados.", cls: "ht-empty" });
            return;
        }

        const list = contentEl.createDiv("ht-archived-list");

        archived.forEach(habit => {
            const item = list.createDiv("ht-archived-item");
            // Asignación de estilos directa al elemento HTML es válida
            item.style.display = "flex";
            item.style.justifyContent = "space-between";
            item.style.alignItems = "center";
            item.style.padding = "10px";
            item.style.borderBottom = "1px solid var(--background-modifier-border)";

            const info = item.createDiv();
            // CORRECCIÓN: Usar 'attr' para styles dentro de createDiv
            info.createDiv({ 
                text: habit.name, 
                attr: { style: "font-weight:bold" } 
            });
            
            // CORRECCIÓN: Usar 'attr' para styles dentro de createDiv
            const actions = item.createDiv({ 
                cls: "ht-archived-actions", 
                attr: { style: "display:flex; gap:8px;" }
            });

            // Botón Restaurar
            const btnRestore = actions.createEl("button", { text: "Restaurar" });
            btnRestore.onclick = async () => {
                await restoreHabit(this.storage, habit.id);
                new Notice(`Hábito "${habit.name}" restaurado.`);
                this.onRestore(); // Refrescar vista principal
                this.onOpen(); // Refrescar modal
            };

            // Botón Eliminar Definitivamente
            const btnDel = actions.createEl("button", { text: "Eliminar", cls: "mod-warning" });
            btnDel.onclick = async () => {
                if(confirm("¿Eliminar permanentemente? Se perderán los datos.")) {
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