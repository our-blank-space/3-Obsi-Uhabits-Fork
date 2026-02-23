// src/ui/modals/AnalyticsModal.ts
// Deprecated: Use HabitAnalyticsModal instead (fully async, modular).
// This modal is kept only for backward compatibility if referenced from other places.
// It now wraps HabitAnalyticsModal.

import { App, Modal } from "obsidian";
import { Habit } from "../../core/types";
import { HabitStorage } from "../../core/storage";
import { HabitAnalyticsModal } from "./HabitAnalyticsModal";

export class AnalyticsModal extends Modal {
    private storage: HabitStorage;
    private habit: Habit;

    constructor(app: App, storage: HabitStorage, habit: Habit) {
        super(app);
        this.storage = storage;
        this.habit = habit;
    }

    onOpen(): void {
        this.close();
        new HabitAnalyticsModal(this.app, { storage: this.storage, habit: this.habit }).open();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}