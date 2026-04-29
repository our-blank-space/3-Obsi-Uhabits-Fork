import { HabitStorage } from "./storage";
import { Habit, HabitEntry, HabitEval, HabitEntries } from "./types";
import { todayString, toDateOnly } from "../utils/dates";

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
        
        // Si no hay meta, evaluamos por presencia de valor > 0
        if (!habit.goal) {
            return entry.value > 0 ? "OK" : "NO";
        }

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

    // --- LÓGICA DE FRECUENCIA ---
    // Evaluamos primero la frecuencia para rechazar días en los que el hábito no aplica.
    const freq = habit.frequency || { mode: "daily" };

    if (freq.mode === "weekdays") {
        const dObj = toDateOnly(date);
        const day = dObj.getDay(); 
        if (day === 0 || day === 6) return "OFF"; 
    } else if (freq.mode === "daily" && freq.interval && freq.interval > 1) {
        // Lógica de "Cada N días" con Ancla
        const createdStr = habit.createdAt.slice(0, 10);
        const targetD = toDateOnly(date);
        const startD = toDateOnly(createdStr);
        
        // Ajustar startD al anchorDay anterior más cercano si existe
        if (freq.anchorDay !== undefined) {
             const currentDay = startD.getDay();
             const diffToAnchor = (currentDay - freq.anchorDay + 7) % 7;
             startD.setDate(startD.getDate() - diffToAnchor);
        }

        const diff = targetD.getTime() - startD.getTime();
        const daysSince = Math.round(diff / 86400000);
        
        if (Math.abs(daysSince) % freq.interval !== 0) return "OFF";
    } else if (freq.mode === "weekly" && freq.days && freq.days.length > 0) {
        // Lógica de Semanal con Intervalo de Semanas (Every N weeks)
        const dObj = toDateOnly(date);
        const day = dObj.getDay();
        if (!freq.days.includes(day)) return "OFF";

        if (freq.interval && freq.interval > 1) {
            const createdStr = habit.createdAt.slice(0, 10);
            const startD = toDateOnly(createdStr);
            // Anclamos al inicio de la semana de creación (Lunes=1)
            const currentDay = startD.getDay() || 7; 
            startD.setDate(startD.getDate() - (currentDay - 1));

            const diff = dObj.getTime() - startD.getTime();
            const weeksSince = Math.floor(Math.round(diff / 86400000) / 7);
            if (Math.abs(weeksSince) % freq.interval !== 0) return "OFF";
        }
    } else if (freq.days && freq.days.length > 0) {
        // Fallback para otros modos con días específicos
        const dObj = toDateOnly(date);
        const day = dObj.getDay();
        if (!freq.days.includes(day)) return "OFF";
    }

    const today = todayString();
    
    // Si la fecha es futura, no evaluamos aún
    if (date > today) return "NONE";

    const created = habit.createdAt ? habit.createdAt.slice(0, 10) : "";
    
    // Si la fecha es anterior a la creación, no es clickeable
    if (created && date < created) return "OFF";

    if (date < today) {
        return "NO";
    }

    return "NONE";
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
