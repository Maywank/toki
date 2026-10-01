export type Task = {
  id: string;
  title: string;
  priority: 1 | 2 | 3;
  order: number;
  createdAt: number;
  completedAt?: number;
  timeSpentSeconds: number;
};

export type DeviceState = {
  revision: number;
  count: number;
  selected: number;
  doneMask: number;
  phase: string;
  elapsedSeconds: number;
  rssi?: number;
  otaName?: string;
  otaPassword?: string;
  otaIp?: string;
  networkIp?: string;
  firmware?: string;
  chip?: string;
  flashBytes?: number;
};

export type Saved = {
  tasks: Task[];
  revision: number;
  syncedIds: string[];
  deviceId: string | null;
  syncedSignature: string;
};

export const emptySaved: Saved = { tasks: [], revision: 0, syncedIds: [], deviceId: null, syncedSignature: '' };
export const emptyDevice: DeviceState = { revision: 0, count: 0, selected: 0, doneMask: 0, phase: 'I', elapsedSeconds: 0 };

export function sortTasks(tasks: Task[]) {
  return [...tasks].filter((task) => !task.completedAt)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export function queueSignature(tasks: Task[]) { return JSON.stringify(sortTasks(tasks).slice(0, 4).map((task) => [task.id, deviceTitle(task.title)])); }

export function deviceTitle(title: string) {
  return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '?').replace(/:/g, '-').trim().slice(0, 32) || 'Task';
}

export function newTask(title: string, order: number): Task {
  return {
    id: Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0'),
    title: title.trim(), priority: 2, order, createdAt: Date.now(), timeSpentSeconds: 0,
  };
}

export function parseVersion(frame: string): Partial<DeviceState> | null {
  const match = /^V:(\d+):(\d+):(\d+):(\d+)$/.exec(frame);
  if (!match) return null;
  return { revision: +match[1], count: +match[2], selected: +match[3], doneMask: +match[4] };
}

export function parseFocus(frame: string): Partial<DeviceState> | null {
  const match = /^F:([IR]):(\d+)$/.exec(frame);
  if (!match) return null;
  return { phase: match[1], elapsedSeconds: +match[2] };
}

export function parseElapsed(frame: string): { id: string; seconds: number } | null {
  const match = /^X:([0-9a-f]{8}):(\d+)$/.exec(frame);
  return match ? { id: match[1], seconds: +match[2] } : null;
}

export function phaseLabel(phase: string) {
  return ({ I: 'Ready', R: 'In progress' } as Record<string, string>)[phase] || phase;
}
