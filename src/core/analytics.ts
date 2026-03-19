import { Habit, HabitEval, HabitEntries } from "./types";
import { evalHabitOnDateWithEntries } from "./entries";
import { todayString, addDays, compareDateStr, getRangeBounds, weekdayShort } from "../utils/dates";
import { HabitStorage } from "./storage";

export interface LineSeries { labels: string[]; values: number[]; }
export interface RangeStats { ok: number; total: number; percent: number; }
export interface TrendSummary { monthDelta: number; yearDelta: number; monthCurrent: number; yearCurrent: number; }
export interface StreakInfo { bestStreak: number; currentStreak: number; lastDate?: string; }
export type WeekdayKey = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
export interface WeekdayStats { ok: number; total: number; percent: number; }
export type HeatmapData = Record<string, HabitEval>;
export interface HabitDateRange { from?: string; to?: string; }

type ScorePoint = { date: string; score: number; };

// --- Exponential Smoothing (Loop Algorithm) ---
export function computeScoreTimeline(habit: Habit, entries: HabitEntries): ScorePoint[] {
    const entryDates = Object.keys(entries.entries);
    let start = todayString();
    if (entryDates.length > 0) {
        entryDates.sort(compareDateStr);
        start = entryDates[0];
    }

    if (habit.createdAt) {
        const created = habit.createdAt.slice(0, 10);
        if (compareDateStr(created, start) < 0) start = created;
    }

    const today = todayString();
    if (compareDateStr(start, today) > 0) return [];

    const frequency = 1;
    const multiplier = Math.pow(0.5, Math.sqrt(frequency) / 13.0);
    let score = 0;
    const result: ScorePoint[] = [];

    for (let d = start; compareDateStr(d, today) <= 0; d = addDays(d, 1)) {
        const ev = evalHabitOnDateWithEntries(habit, d, entries);
        let checkValue: number | null = null;

        if (ev === "OK") checkValue = 1;
        else if (ev === "NO") checkValue = 0;
        else checkValue = null;

        if (checkValue !== null) score = score * multiplier + checkValue * (1 - multiplier);
        else score = score * multiplier;

        result.push({ date: d, score });
    }
    return result;
}

export function getOverallStats(habit: Habit, entries: HabitEntries): RangeStats {
    const today = todayString();
    const dates = Object.keys(entries.entries);
    let ok = 0; let total = 0;

    for (const d of dates) {
        if (compareDateStr(d, today) > 0) continue;
        const ev = evalHabitOnDateWithEntries(habit, d, entries);
        if (ev === "OK") { ok++; total++; }
        else if (ev === "NO") { total++; }
    }

    const timeline = computeScoreTimeline(habit, entries);
    const last = timeline.length > 0 ? timeline[timeline.length - 1] : null;
    const percent = last ? Math.round(last.score * 100) : 0;

    return { ok, total, percent };
}

export function getTrendSummary(habit: Habit, entries: HabitEntries): TrendSummary {
    const timeline = computeScoreTimeline(habit, entries);
    if (timeline.length === 0) return { monthDelta: 0, yearDelta: 0, monthCurrent: 0, yearCurrent: 0 };

    const today = todayString();
    const currentScore = timeline[timeline.length - 1].score * 100;

    const getScoreAt = (target: string): number => {
        if (compareDateStr(target, timeline[0].date) < 0) return 0;
        for (let i = 0; i < timeline.length; i++) {
            if (compareDateStr(timeline[i].date, target) >= 0) return timeline[i].score * 100;
        }
        return timeline[timeline.length - 1].score * 100;
    };

    const monthAgo = getScoreAt(addDays(today, -30));
    const yearAgo = getScoreAt(addDays(today, -365));

    return {
        monthDelta: Math.round(currentScore - monthAgo),
        yearDelta: Math.round(currentScore - yearAgo),
        monthCurrent: Math.round(currentScore),
        yearCurrent: Math.round(currentScore)
    };
}

export function buildHeatmapData(habit: Habit, entries: HabitEntries): HeatmapData {
    const map: HeatmapData = {};
    const today = todayString();
    const dates = Object.keys(entries.entries).sort();
    
    // Si no hay fechas, creamos un mapa vacío
    if (dates.length === 0) return map;

    const start = dates[0];
    
    for (let d = start; compareDateStr(d, today) <= 0; d = addDays(d, 1)) {
        const ev = evalHabitOnDateWithEntries(habit, d, entries);
        // Omitimos los puramente NONE donde no hubo interacción ni requiere, para ahorrar espacio
        if (ev !== "NONE") map[d] = ev;
    }
    return map;
}

export function buildScoreSeries(habit: Habit, entries: HabitEntries, mode: "week" | "month" | "year" | "all"): LineSeries {
    const timeline = computeScoreTimeline(habit, entries);
    const { from, to } = getRangeBounds(mode);
    const labels: string[] = []; const values: number[] = [];

    for (const p of timeline) {
        if (compareDateStr(p.date, from) >= 0 && compareDateStr(p.date, to) <= 0) {
            labels.push(p.date.slice(5));
            values.push(Math.round(p.score * 100));
        }
    }
    return { labels, values };
}

export function buildHistorySeries(habit: Habit, entries: HabitEntries, mode: "week" | "month" | "year" | "all"): LineSeries {
    const { from, to } = getRangeBounds(mode);
    const labels: string[] = []; const values: number[] = [];

    if (mode !== "year") {
        for (let d = from; compareDateStr(d, to) <= 0; d = addDays(d, 1)) {
            const ev = evalHabitOnDateWithEntries(habit, d, entries);
            const ent = entries.entries[d];
            labels.push(d.slice(5));
            values.push(habit.type === "yesno" ? (ev === "OK" ? 1 : 0) : (ent && typeof ent.value === 'number' ? ent.value : 0));
        }
    } else {
        const monthMap = new Map<string, number>();
        const countMap = new Map<string, number>();
        const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

        for (let d = from; compareDateStr(d, to) <= 0; d = addDays(d, 1)) {
            const mIdx = parseInt(d.split('-')[1]) - 1;
            const key = months[mIdx];
            const ev = evalHabitOnDateWithEntries(habit, d, entries);
            const ent = entries.entries[d];

            if (!monthMap.has(key)) { monthMap.set(key, 0); countMap.set(key, 0); }

            if (habit.type === 'yesno') {
                if (ev === "OK") monthMap.set(key, monthMap.get(key)! + 1);
            } else {
                if (ent && typeof ent.value === 'number') {
                    monthMap.set(key, monthMap.get(key)! + ent.value);
                    countMap.set(key, countMap.get(key)! + 1);
                }
            }
        }
        monthMap.forEach((val, key) => {
            labels.push(key);
            if (habit.type === 'quant' && countMap.get(key)! > 0) values.push(Math.round(val / countMap.get(key)!));
            else values.push(val);
        });
    }
    return { labels, values };
}

// Wrappers asíncronos para integración
export async function getStreakInfoForHabit(storage: HabitStorage, habitId: string): Promise<StreakInfo> {
    const habit = storage.getData().habits.find((h) => h.id === habitId);
    if (!habit) return { bestStreak: 0, currentStreak: 0 };

    const entries = await storage.getEntries(habitId);
    let curr = 0, best = 0;
    const today = todayString();
    const dates = Object.keys(entries.entries).sort();
    if (dates.length === 0) return { bestStreak: 0, currentStreak: 0 };

    let cursor = dates[0];
    while (compareDateStr(cursor, today) <= 0) {
        const ev = evalHabitOnDateWithEntries(habit, cursor, entries);
        
        if (ev === "OK") {
            curr++; 
            if (curr > best) best = curr;
        } else if (ev === "NO") {
            // Solo rompemos la racha frente a un "NO" explícito. 
            // Los "NONE" (días sin registrar en hábitos cuantitativos sin meta o días ignorados por frecuencia) mantienen viva la racha.
            curr = 0;
        }
        
        cursor = addDays(cursor, 1);
    }
    return { bestStreak: best, currentStreak: curr, lastDate: dates[dates.length - 1] };
}

export async function getOverallScoreForHabit(storage: HabitStorage, habitId: string): Promise<RangeStats> {
    const habit = storage.getData().habits.find((h) => h.id === habitId);
    const entries = await storage.getEntries(habitId);
    return habit ? getOverallStats(habit, entries) : { ok: 0, total: 0, percent: 0 };
}

export async function getWeekdayStatsForHabit(storage: HabitStorage, habitId: string): Promise<Record<WeekdayKey, WeekdayStats>> {
    const habit = storage.getData().habits.find((h) => h.id === habitId);
    const entries = await storage.getEntries(habitId);
    const stats: any = {};
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(k => stats[k] = { ok: 0, total: 0, percent: 0 });
    if (habit) {
        Object.keys(entries.entries).forEach(d => {
            if (evalHabitOnDateWithEntries(habit, d, entries) !== "NONE") {
                const wd = weekdayShort(d);
                if (stats[wd]) {
                    stats[wd].total++;
                    if (evalHabitOnDateWithEntries(habit, d, entries) === "OK") stats[wd].ok++;
                }
            }
        });
    }
    Object.keys(stats).forEach(k => stats[k].percent = stats[k].total ? Math.round(stats[k].ok / stats[k].total * 100) : 0);
    return stats;
}

export async function getMoodDistribution(habit: Habit, entries: HabitEntries, mode: "week" | "month" | "year" | "all"): Promise<MoodStats> {
    const { from, to } = mode === "all" ? { from: undefined, to: undefined } : getRangeBounds(mode);
    const counts: Record<string, number> = {
        "😫": 0, "😔": 0, "😑": 0, "🙂": 0, "🔥": 0
    };

    for (const date in entries.entries) {
        const inRange = !from || !to || (compareDateStr(date, from) >= 0 && compareDateStr(date, to) <= 0);
        if (inRange) {
            const entry = entries.entries[date];
            if (entry.mood && counts.hasOwnProperty(entry.mood)) {
                counts[entry.mood]++;
            }
        }
    }

    const labels: string[] = [];
    const data: number[] = [];
    const order = ["😫", "😔", "😑", "🙂", "🔥"];

    order.forEach(mood => {
        if (counts[mood] > 0) {
            labels.push(mood);
            data.push(counts[mood]);
        }
    });

    return { labels, data };
}

export function getAverageEnergy(habit: Habit, entries: HabitEntries, mode: "week" | "month" | "year" | "all"): string {
    const { from, to } = mode === "all" ? { from: undefined, to: undefined } : getRangeBounds(mode);
    let total = 0;
    let count = 0;

    for (const date in entries.entries) {
        const inRange = !from || !to || (compareDateStr(date, from) >= 0 && compareDateStr(date, to) <= 0);
        if (inRange) {
            const entry = entries.entries[date];
            if (entry.energy) {
                total += entry.energy;
                count++;
            }
        }
    }
    if (count === 0) return "-";
    return (total / count).toFixed(1);
}

export interface MoodStats {
    labels: string[];
    data: number[];
}
