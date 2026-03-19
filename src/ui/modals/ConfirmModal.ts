import { App, Modal, Setting } from "obsidian";

export class ConfirmModal extends Modal {
    private onConfirm: () => void;
    private title: string;
    private message: string;
    private confirmText: string;
    private confirmClass: string;

    constructor(app: App, title: string, message: string, onConfirm: () => void, confirmText: string = "Eliminar", confirmClass: string = "mod-warning") {
        super(app);
        this.title = title;
        this.message = message;
        this.onConfirm = onConfirm;
        this.confirmText = confirmText;
        this.confirmClass = confirmClass;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass("ht-confirm-modal");
        
        contentEl.createEl("h2", { text: this.title });
        contentEl.createEl("p", { text: this.message, cls: "ht-confirm-msg" });

        const footer = contentEl.createDiv("habit-modal-footer");
        
        const cancelBtn = footer.createEl("button", { text: "Cancelar", cls: "ht-btn" });
        cancelBtn.onclick = () => this.close();

        const confirmBtn = footer.createEl("button", { text: this.confirmText, cls: `ht-btn ${this.confirmClass}` });
        confirmBtn.onclick = () => {
            this.onConfirm();
            this.close();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}
