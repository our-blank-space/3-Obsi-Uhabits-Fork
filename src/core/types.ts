// src/core/types.ts

export type HabitType = "yesno" | "quant";
export type GoalType = "atLeast" | "atMost" | "exactly";
export type HabitSortMode = "manual" | "alpha" | "color";
export type DayBarOrientation = "recent-right" | "recent-left";
export type FrequencyMode = "daily";

// Evaluación (OK/NO)
export type HabitEval = "OK" | "NO" | "NONE";

export const MOOD_OPTIONS = ["🙂", "😑", "😔"] as const;
export type MoodEmoji = typeof MOOD_OPTIONS[number];

export interface HabitGoal {
    type: GoalType;
    value: number;
    unit?: string;
}

export interface HabitFrequency {
    mode: FrequencyMode;
}

// ----------
// 🔥 NUEVO: Ahora soporta energía y ánimo
// ----------
export interface HabitEntry {
    date: string;            // YYYY-MM-DD
    value: "✔" | "✖" | number;
    notePath?: string;

    // CONTEXTO
    energy?: number;         // 1 (baja) a 5 (alta)
    mood?: string;           // emoji
    notes?: string;          // observación de texto libre
}

export interface HabitEntries {
    entries: Record<string, HabitEntry>;
}

export interface Habit {
    id: string;
    name: string;
    color: string;
    icon?: string;
    type: HabitType;
    frequency: HabitFrequency;
    goal?: HabitGoal;
    archived?: boolean;
    createdAt: string;
    order?: number;
    // La data (entries) ahora se carga bajo demanda
}

export interface HabitPluginSettings {
    firstDayOfWeek: "Mon" | "Sun";
    notesFolder: string;
    openNoteAfterCreate: boolean;
    askBeforeCreateNote: boolean;
    noteFilenamePattern: string;
    noteTemplate: string;
    reportsFolder: string;
    dayBarOrientation: DayBarOrientation;
    autoHideCompletedToday: boolean;
    soundsEnabled: boolean;
    backupFolder: string;
    sortMode: HabitSortMode;
}

export interface HabitData {
    version: number;
    habits: Habit[];
    settingsSnapshot: HabitPluginSettings;
    lastBackup?: string; // 🔥 NUEVO: Fecha del último backup automático
}
