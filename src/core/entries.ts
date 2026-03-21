import { HabitStorage } from "./storage";
import { Habit, HabitEntry, HabitEval, HabitEntries } from "./types";
import { todayString, toDateOnly, getStartOfISOWeek, addDays } from "../utils/dates";

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
    // Si ya está completado ("OK"), lo mostramos siempre.
    if (basic === "OK") return "OK";

    // --- LÓGICA DE FRECUENCIA ---
    // Evaluamos primero la frecuencia para rechazar días en los que el hábito no aplica.
    const freq = habit.frequency || { mode: "daily" };

    if (freq.mode === "weekdays") {
        const dObj = toDateOnly(date);
        const day = dObj.getDay(); 
        if (day === 0 || day === 6) return "OFF"; 
    } else if (freq.mode === "daily" && freq.interval && freq.interval > 1) {
        // Lógica de "Cada N días" con Ancla
        const createdRaw = habit.createdAt || todayString();
        const createdStr = createdRaw.slice(0, 10);
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
            const createdRaw = habit.createdAt || todayString();
            const createdStr = createdRaw.slice(0, 10);
            const startD = toDateOnly(createdStr);
            // Anclamos al inicio de la semana de creación (Lunes=1)
            const currentDay = startD.getDay() || 7; 
            startD.setDate(startD.getDate() - (currentDay - 1));

            const diff = dObj.getTime() - startD.getTime();
            const weeksSince = Math.floor(Math.round(diff / 86400000) / 7);
            if (Math.abs(weeksSince) % freq.interval !== 0) return "OFF";
        }
    }

    let completedInWeek = 0;
    const isDPW = freq.mode === "weekly" && !!(freq.daysPerWeek && freq.daysPerWeek > 0);
    const startOfWeek = getStartOfISOWeek(date);

    if (isDPW) {
        for (let i = 0; i < 7; i++) {
            const dStr = addDays(startOfWeek, i);
            const e = entries.entries[dStr];
            if (e && (e.value === "✔" || (typeof e.value === "number" && e.value > 0))) {
                completedInWeek++;
            }
        }
        
        if (isDPW && freq.daysPerWeek !== undefined && completedInWeek >= freq.daysPerWeek) {
            // Si ya se alcanzó la meta semanal y este día no tiene registro "OK", se bloquea.
            const currentEntry = entries.entries[date];
            if (!currentEntry || (currentEntry.value !== "✔" && !(typeof currentEntry.value === "number" && currentEntry.value > 0))) {
                return "OFF"; // Esto muestra la x sutil
            }
        }
    }

    const today = todayString();
    
    // Si la fecha es futura, no evaluamos aún
    if (date > today) return "NONE";

    const created = habit.createdAt ? habit.createdAt.slice(0, 10) : "";
    
    // Si la fecha es anterior a la creación, pero la creación no es en el futuro respecto a hoy
    if (created && date < created && created <= today) return "OFF";

    if (date < today) {
        const currentEntry = entries.entries[date];
        if (currentEntry && (currentEntry.value === "✔" || (typeof currentEntry.value === "number" && currentEntry.value > 0))) {
            return "OK";
        }

        // Si es una meta semanal (DPW), verificamos si aún se podía cumplir la meta en esa semana
        if (isDPW && freq.daysPerWeek !== undefined) {
            const endOfWeek = addDays(startOfWeek, 6);
            if (endOfWeek < today) {
                // Semana pasada completamente: si no se cumplió la meta, mostramos fallo SOLO el Domingo
                if (completedInWeek < freq.daysPerWeek) {
                    const dObj = toDateOnly(date);
                    if (dObj.getDay() === 0) return "NO"; // Domingo
                    return "OFF";
                }
                return "NONE"; 
            } else {
                // Semana actual: si no se ha cumplido la meta, el día pasado no es un fallo todavía
                // SIEMPRE QUE aún haya días suficientes en el resto de la semana (desde hoy en adelante)
                let remainingDaysInWeek = 0;
                for (let i = 0; i < 7; i++) {
                    const dStr = addDays(startOfWeek, i);
                    if (dStr >= today) remainingDaysInWeek++;
                }

                if (completedInWeek + remainingDaysInWeek >= freq.daysPerWeek) {
                    return "NONE"; // Se ve vacío/limpio
                } else {
                    return "NO"; // Ya es imposible cumplir la meta, mostrar fallo
                }
            }
        }
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
