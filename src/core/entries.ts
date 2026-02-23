import { HabitStorage } from "./storage";
import { Habit, HabitEntry, HabitEval, HabitEntries } from "./types";
import { todayString } from "../utils/dates";

/* ============================================
   Evaluación de entradas (sin cambios)
============================================ */

export function evalHabitEntry(habit: Habit, entry?: HabitEntry): HabitEval {
    if (!entry) return "NONE";

    if (habit.type === "yesno") {
        if (entry.value === "✔") return "OK";
        if (entry.value === "✖") return "NO";
        return "NONE";
    } else {
        if (typeof entry.value !== "number") return "NONE";
        if (!habit.goal) return "NONE";
        const v = entry.value;

        switch (habit.goal.type) {
            case "atLeast": return v >= habit.goal.value ? "OK" : "NO";
            case "atMost": return v <= habit.goal.value ? "OK" : "NO";
            case "exactly": return v === habit.goal.value ? "OK" : "NO";
            default: return "NONE";
        }
    }
}

/**
 * Evaluación sobre una fecha específica.
 * Requiere el objeto HabitEntries cargado.
 */
export function evalHabitOnDateWithEntries(habit: Habit, date: string, entries: HabitEntries): HabitEval {
    const entry = entries.entries[date];
    const basic = evalHabitEntry(habit, entry);
    if (basic !== "NONE") return basic;

    if (habit.type === "yesno") {
        const today = todayString(); // 🔥 FIX: Usar helper local, no UTC
        if (date < today) return "NO";
    }

    return basic;
}

/**
 * Versión asíncrona que carga los datos si es necesario.
 */
export async function evalHabitOnDate(storage: HabitStorage, habit: Habit, date: string): Promise<HabitEval> {
    const entries = await storage.getEntries(habit.id);
    return evalHabitOnDateWithEntries(habit, date, entries);
}

/* ============================================
   🔥 EXTENSIÓN: setEntry ahora soporta energía + ánimo
============================================ */

interface EntryExtraFields {
    energy?: number;
    mood?: string;
    notes?: string;
}

export async function setEntry(
    storage: HabitStorage,
    habitId: string,
    date: string,
    value: "✔" | "✖" | number,
    notePath?: string,
    extra?: EntryExtraFields
) {
    const entriesData = await storage.getEntries(habitId);

    // Mantener datos previos si existen
    const prev = entriesData.entries[date] ?? {};

    entriesData.entries[date] = {
        date,
        value,
        notePath: notePath ?? prev.notePath,
        energy: extra?.energy ?? prev.energy,
        mood: extra?.mood ?? prev.mood,
        notes: extra?.notes ?? prev.notes
    };

    await storage.saveEntries(habitId, entriesData);
}

/* ============================================
   Helpers auxiliares
============================================ */

export async function deleteEntry(storage: HabitStorage, habitId: string, date: string) {
    const entriesData = await storage.getEntries(habitId);
    if (entriesData.entries[date]) {
        delete entriesData.entries[date];
        await storage.saveEntries(habitId, entriesData);
    }
}

export const clearEntry = deleteEntry;

export async function getEntryForDate(
    storage: HabitStorage,
    habitId: string,
    date: string
): Promise<HabitEntry | undefined> {
    const entriesData = await storage.getEntries(habitId);
    return entriesData.entries[date];
}
