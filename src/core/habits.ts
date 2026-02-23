import { HabitStorage } from "./storage";
import { Habit, HabitType, HabitFrequency, HabitGoal, HabitSortMode } from "./types";

function randomHabitId(): string {
	return "h_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

export interface CreateHabitOptions {
	name: string;
	type: HabitType;
	color?: string;
	icon?: string;
	frequency: HabitFrequency;
	goal?: HabitGoal;
}

export async function createHabit(storage: HabitStorage, opts: CreateHabitOptions): Promise<Habit> {
	if (!opts.name.trim()) throw new Error("Nombre obligatorio");
	const habit: Habit = {
		id: randomHabitId(),
		name: opts.name.trim(),
		type: opts.type,
		color: opts.color ?? "#FF8888",
		icon: opts.icon,
		frequency: opts.frequency,
		goal: opts.goal,
		archived: false,
		createdAt: new Date().toISOString(),
		order: storage.getData().habits.length
	};
	await storage.update(d => d.habits.push(habit));
	return habit;
}

export async function updateHabit(storage: HabitStorage, habit: Habit) {
	await storage.update((d) => {
		const idx = d.habits.findIndex((h) => h.id === habit.id);
		if (idx !== -1) d.habits[idx] = habit;
	});
}

export async function archiveHabit(storage: HabitStorage, id: string) {
	await storage.update((d) => {
		const h = d.habits.find((x) => x.id === id);
		if (h) h.archived = true;
	});
}

export async function restoreHabit(storage: HabitStorage, id: string) {
	await storage.update((d) => {
		const h = d.habits.find((x) => x.id === id);
		if (h) h.archived = false;
	});
}

export async function deleteHabit(storage: HabitStorage, id: string) {
	await storage.update((d) => {
		d.habits = d.habits.filter((h) => h.id !== id);
	});
}

export function sortHabits(habits: Habit[], mode: HabitSortMode): Habit[] {
	const arr = [...habits];
	if (mode === "alpha") return arr.sort((a, b) => a.name.localeCompare(b.name));
	if (mode === "color") return arr.sort((a, b) => a.color.localeCompare(b.color));
	return arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function reorderHabits(storage: HabitStorage, sourceId: string, targetId: string) {
	await storage.update((d) => {
		const habits = d.habits;
		const fromIdx = habits.findIndex((h) => h.id === sourceId);
		const toIdx = habits.findIndex((h) => h.id === targetId);
		if (fromIdx === -1 || toIdx === -1) return;
		const [moved] = habits.splice(fromIdx, 1);
		habits.splice(toIdx, 0, moved);
		habits.forEach((h, idx) => h.order = idx);
	});
}