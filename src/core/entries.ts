import { HabitStorage } from "./storage";
import { Habit, HabitEntry, HabitEval, HabitEntries } from "./types";
import { todayString, toDateOnly, getStartOfISOWeek, addDays } from "../utils/dates";

/* ============================================
   Entry Evaluation
============================================ */

export function evalHabitEntry(habit: Habit, entry?: HabitEntry): HabitEval {
    if (!entry) return "NONE";

    if (habit.type === "yesno") {
        if (entry.value === "✔") return "OK";
        if (entry.value === "✖") return "NO";
        return "NONE";
    } else {
        if (typeof entry.value !== "number") return "NONE";
        
        // If no goal, evaluate by presence of value > 0
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
 * Evaluation for a specific date.
 * Requires the HabitEntries object to be loaded.
 */
export function evalHabitOnDateWithEntries(habit: Habit, date: string, entries: HabitEntries): HabitEval {
    const entry = entries.entries[date];
    const basic = evalHabitEntry(habit, entry);
    // If already completed ("OK"), we always show it.
    if (basic === "OK") return "OK";

    // --- FREQUENCY LOGIC ---
    // First evaluate frequency to reject days where the habit doesn't apply.
    const freq = habit.frequency || { mode: "daily" };

    if (freq.mode === "weekdays") {
        const dObj = toDateOnly(date);
        const day = dObj.getDay(); 
        if (day === 0 || day === 6) return "OFF"; 
    } else if (freq.mode === "daily" && freq.interval && freq.interval > 1) {
        // "Every N days" logic with Anchor
        const createdRaw = habit.createdAt || todayString();
        const createdStr = createdRaw.slice(0, 10);
        const targetD = toDateOnly(date);
        const startD = toDateOnly(createdStr);
        
        // Adjust startD to the nearest previous anchorDay if it exists
        if (freq.anchorDay !== undefined) {
             const currentDay = startD.getDay();
             const diffToAnchor = (currentDay - freq.anchorDay + 7) % 7;
             startD.setDate(startD.getDate() - diffToAnchor);
        }

        const diff = targetD.getTime() - startD.getTime();
        const daysSince = Math.round(diff / 86400000);
        
        if (Math.abs(daysSince) % freq.interval !== 0) return "OFF";
    } else if (freq.mode === "weekly" && freq.days && freq.days.length > 0) {
        // Weekly Logic with Week Interval (Every N weeks)
        const dObj = toDateOnly(date);
        const day = dObj.getDay();
        if (!freq.days.includes(day)) return "OFF";

        if (freq.interval && freq.interval > 1) {
            const createdRaw = habit.createdAt || todayString();
            const createdStr = createdRaw.slice(0, 10);
            const startD = toDateOnly(createdStr);
            // Anchor to the start of the creation week (Monday=1)
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
            // If weekly goal is already met and this day has no "OK" record, it's blocked.
            const currentEntry = entries.entries[date];
            if (!currentEntry || (currentEntry.value !== "✔" && !(typeof currentEntry.value === "number" && currentEntry.value > 0))) {
                return "OFF"; // This shows the subtle x
            }
        }
    }

    const today = todayString();
    
    // If date is in the future, don't evaluate yet
    if (date > today) return "NONE";

    const created = habit.createdAt ? habit.createdAt.slice(0, 10) : "";
    
    // If date is before creation, but creation isn't in the future relative to today
    if (created && date < created && created <= today) return "OFF";

    if (date < today) {
        const currentEntry = entries.entries[date];
        if (currentEntry && (currentEntry.value === "✔" || (typeof currentEntry.value === "number" && currentEntry.value > 0))) {
            return "OK";
        }

        // If it's a weekly goal (DPW), check if it was still possible to meet the goal in that week
        if (isDPW && freq.daysPerWeek !== undefined) {
            const endOfWeek = addDays(startOfWeek, 6);
            if (endOfWeek < today) {
                // Last week completely: if goal wasn't met, show failure ONLY on Sunday
                if (completedInWeek < freq.daysPerWeek) {
                    const dObj = toDateOnly(date);
                    if (dObj.getDay() === 0) return "NO"; // Sunday
                    return "OFF";
                }
                return "NONE"; 
            } else {
                // Current week: if goal hasn't been met yet, past day isn't a failure yet
                // AS LONG AS there are still enough days in the rest of the week (from today onwards)
                let remainingDaysInWeek = 0;
                for (let i = 0; i < 7; i++) {
                    const dStr = addDays(startOfWeek, i);
                    if (dStr >= today) remainingDaysInWeek++;
                }

                if (completedInWeek + remainingDaysInWeek >= freq.daysPerWeek) {
                    return "NONE"; // Looks empty/clean
                } else {
                    return "NO"; // Already impossible to meet goal, show failure
                }
            }
        }
        return "NO";
    }

    return "NONE";
}

/**
 * Asynchronous version that loads data if necessary.
 */
export async function evalHabitOnDate(storage: HabitStorage, habit: Habit, date: string): Promise<HabitEval> {
    const entries = await storage.getEntries(habit.id);
    return evalHabitOnDateWithEntries(habit, date, entries);
}

/* ============================================
   🔥 EXTENSION: setEntry now supports energy + mood
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

    // Keep previous data if it exists
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
   Auxiliary Helpers
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
