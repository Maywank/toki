export type Task = {
  id: string;
  title: string;
  minutes: 5 | 10 | 15;
  priority: 1 | 2 | 3;
  order: number;
  createdAt: number;
  completedAt?: number;
};

export type DeviceState = {
  revision: number;
  count: number;
  selected: number;
  doneMask: number;
  phase: string;
  remaining: number;
};

export type Saved = {
  tasks: Task[];
  revision: number;
  syncedIds: string[];
  deviceId: string | null;
};

export const emptySaved: Saved = { tasks: [], revision: 0, syncedIds: [], deviceId: null };
export const emptyDevice: DeviceState = { revision: 0, count: 0, selected: 0, doneMask: 0, phase: 'I', remaining: 0 };

export function sortTasks(tasks: Task[]) {
  return [...tasks].filter((task) => !task.completedAt)
    .sort((a, b) => a.priority - b.priority || a.order - b.order || a.createdAt - b.createdAt);
}

export function deviceTitle(title: string) {
  return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '?').replace(/:/g, '-').trim().slice(0, 32) || 'Task';
}

export function newTask(title: string, minutes: 5 | 10 | 15, priority: 1 | 2 | 3, order: number): Task {
  return {
    id: Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0'),
    title: title.trim(), minutes, priority, order, createdAt: Date.now(),
  };
}

export function parseVersion(frame: string): Partial<DeviceState> | null {
  const match = /^V:(\d+):(\d+):(\d+):(\d+)$/.exec(frame);
  if (!match) return null;
  return { revision: +match[1], count: +match[2], selected: +match[3], doneMask: +match[4] };
}

export function parseFocus(frame: string): Partial<DeviceState> | null {
  const match = /^F:([IHWRUBE]):(\d+)$/.exec(frame);
  if (!match) return null;
  return { phase: match[1], remaining: +match[2] };
}

export function phaseLabel(phase: string) {
  return ({ I: 'Ready', H: 'Finding home', W: 'Setting pointer', R: 'Focusing', U: 'Time up · task open', B: 'Returning pointer', E: 'Check home switch' } as Record<string, string>)[phase] || phase;
}
