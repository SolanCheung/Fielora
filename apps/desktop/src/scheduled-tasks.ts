import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CreateScheduledTaskRequest,
  ScheduledTaskCadence,
  ScheduledTaskStatus,
  ScheduledTaskView,
  UpdateScheduledTaskRequest,
} from './scheduled-task-types';

type ScheduledTaskExecutor = (task: ScheduledTaskView) => Promise<string>;
type Clock = () => number;

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`Invalid scheduled task ${label}`);
  const result = value.trim();
  if (result.length === 0 || result.length > max) throw new Error(`Invalid scheduled task ${label}`);
  return result;
}

function identifier(value: unknown, label: string): string {
  return text(value, label, 256);
}

function cadence(value: unknown): ScheduledTaskCadence {
  if (value !== 'ONCE' && value !== 'DAILY' && value !== 'WEEKLY') throw new Error('Invalid scheduled task cadence');
  return value;
}

function status(value: unknown): ScheduledTaskStatus {
  if (value !== 'ACTIVE' && value !== 'PAUSED' && value !== 'COMPLETED') throw new Error('Invalid scheduled task status');
  return value;
}

function localTime(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Invalid scheduled task time');
  return value;
}

function optionalTimestamp(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid scheduled task timestamp');
  return value;
}

function validateCreate(value: CreateScheduledTaskRequest): CreateScheduledTaskRequest {
  const nextCadence = cadence(value.cadence);
  const weekday = value.weekday;
  if (weekday !== null && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) throw new Error('Invalid scheduled task weekday');
  if (nextCadence === 'WEEKLY' && weekday === null) throw new Error('Weekly scheduled task requires a weekday');
  if (nextCadence === 'ONCE' && value.run_at === null) throw new Error('One-time scheduled task requires a run time');
  if (!Number.isInteger(value.max_steps) || value.max_steps < 1 || value.max_steps > 64) throw new Error('Invalid scheduled task max steps');
  if (value.permission !== 'READ_ONLY' && value.permission !== 'REVIEW_CHANGES' && value.permission !== 'FULL_CONTROL') throw new Error('Invalid scheduled task permission');
  return {
    name: text(value.name, 'name', 120),
    task: text(value.task, 'instruction', 32768),
    field_id: identifier(value.field_id, 'project'),
    conversation_id: identifier(value.conversation_id, 'conversation'),
    provider_config_id: identifier(value.provider_config_id, 'provider'),
    model_id: value.model_id === null ? null : text(value.model_id, 'model', 256),
    permission: value.permission,
    max_steps: value.max_steps,
    cadence: nextCadence,
    local_time: localTime(value.local_time),
    weekday: nextCadence === 'WEEKLY' ? weekday : null,
    run_at: nextCadence === 'ONCE' ? optionalTimestamp(value.run_at) : null,
    timezone: text(value.timezone, 'timezone', 128),
  };
}

export function nextScheduledRun(task: Pick<ScheduledTaskView, 'cadence' | 'local_time' | 'weekday' | 'run_at'>, after: number): number | null {
  if (task.cadence === 'ONCE') return task.run_at !== null && task.run_at > after ? task.run_at : null;
  const [hour, minute] = task.local_time.split(':').map(Number) as [number, number];
  const next = new Date(after);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (task.cadence === 'DAILY') {
    if (next.getTime() <= after) next.setDate(next.getDate() + 1);
    return next.getTime();
  }
  const weekday = task.weekday ?? 0;
  let days = (weekday - next.getDay() + 7) % 7;
  if (days === 0 && next.getTime() <= after) days = 7;
  next.setDate(next.getDate() + days);
  return next.getTime();
}

function parseStoredTask(value: unknown): ScheduledTaskView | null {
  if (!value || typeof value !== 'object') return null;
  try {
    const task = value as ScheduledTaskView;
    const request = validateCreate(task);
    return {
      ...request,
      id: identifier(task.id, 'id'),
      status: status(task.status),
      next_run_at: optionalTimestamp(task.next_run_at),
      last_run_at: optionalTimestamp(task.last_run_at),
      last_agent_run_id: task.last_agent_run_id === null ? null : identifier(task.last_agent_run_id, 'Agent run'),
      last_error: task.last_error === null ? null : text(task.last_error, 'error', 500),
      created_at: optionalTimestamp(task.created_at)!,
      updated_at: optionalTimestamp(task.updated_at)!,
    };
  } catch { return null; }
}

export class ScheduledTaskService {
  private tasks: ScheduledTaskView[] = [];
  private timer: NodeJS.Timeout | undefined;
  private checking = false;
  private readonly filePath: string;
  private readonly execute: ScheduledTaskExecutor;
  private readonly clock: Clock;

  private constructor(filePath: string, execute: ScheduledTaskExecutor, clock: Clock) {
    this.filePath = filePath;
    this.execute = execute;
    this.clock = clock;
  }

  static async open(filePath: string, execute: ScheduledTaskExecutor, clock: Clock = Date.now): Promise<ScheduledTaskService> {
    const service = new ScheduledTaskService(filePath, execute, clock);
    try {
      const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
      if (Array.isArray(parsed)) service.tasks = parsed.map(parseStoredTask).filter((task): task is ScheduledTaskView => task !== null);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return service;
  }

  list(): ScheduledTaskView[] {
    return this.tasks.map((task) => ({ ...task })).sort((left, right) => (left.next_run_at ?? Number.MAX_SAFE_INTEGER) - (right.next_run_at ?? Number.MAX_SAFE_INTEGER));
  }

  async create(input: CreateScheduledTaskRequest): Promise<ScheduledTaskView> {
    const request = validateCreate(input);
    const now = this.clock();
    const task: ScheduledTaskView = {
      ...request,
      id: randomUUID(), status: 'ACTIVE',
      next_run_at: nextScheduledRun(request, now),
      last_run_at: null, last_agent_run_id: null, last_error: null,
      created_at: now, updated_at: now,
    };
    if (task.next_run_at === null) throw new Error('计划时间必须晚于当前时间');
    this.tasks.push(task);
    await this.persist();
    return { ...task };
  }

  async update(input: UpdateScheduledTaskRequest): Promise<ScheduledTaskView> {
    const index = this.tasks.findIndex((task) => task.id === input.id);
    if (index < 0) throw new Error('Scheduled task not found');
    const current = this.tasks[index]!;
    const merged = validateCreate({
      name: input.name ?? current.name,
      task: input.task ?? current.task,
      field_id: current.field_id,
      conversation_id: current.conversation_id,
      provider_config_id: input.provider_config_id ?? current.provider_config_id,
      model_id: input.model_id === undefined ? current.model_id : input.model_id,
      permission: input.permission ?? current.permission,
      max_steps: input.max_steps ?? current.max_steps,
      cadence: input.cadence ?? current.cadence,
      local_time: input.local_time ?? current.local_time,
      weekday: input.weekday === undefined ? current.weekday : input.weekday,
      run_at: input.run_at === undefined ? current.run_at : input.run_at,
      timezone: input.timezone ?? current.timezone,
    });
    const nextStatus = input.status === undefined ? current.status : status(input.status);
    const updated: ScheduledTaskView = {
      ...current, ...merged, status: nextStatus, updated_at: this.clock(),
      next_run_at: nextStatus === 'ACTIVE' ? nextScheduledRun(merged, this.clock()) : null,
    };
    this.tasks[index] = updated;
    await this.persist();
    return { ...updated };
  }

  async delete(id: string): Promise<null> {
    const next = this.tasks.filter((task) => task.id !== id);
    if (next.length === this.tasks.length) throw new Error('Scheduled task not found');
    this.tasks = next;
    await this.persist();
    return null;
  }

  async runNow(id: string): Promise<ScheduledTaskView> {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) throw new Error('Scheduled task not found');
    return this.run(task, false);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.runDue(); }, 15_000);
    void this.runDue();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async runDue(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const now = this.clock();
      for (const task of this.tasks.filter((item) => item.status === 'ACTIVE' && item.next_run_at !== null && item.next_run_at <= now)) await this.run(task, true);
    } finally { this.checking = false; }
  }

  private async run(task: ScheduledTaskView, scheduled: boolean): Promise<ScheduledTaskView> {
    const attemptedAt = this.clock();
    try {
      task.last_agent_run_id = await this.execute({ ...task });
      task.last_error = null;
    } catch (error) {
      task.last_error = (error instanceof Error ? error.message : String(error)).slice(0, 500) || '运行失败';
    }
    task.last_run_at = attemptedAt;
    if (scheduled && task.cadence === 'ONCE') task.status = 'COMPLETED';
    task.next_run_at = task.status === 'ACTIVE' ? nextScheduledRun(task, attemptedAt) : null;
    task.updated_at = this.clock();
    await this.persist();
    return { ...task };
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.tasks, null, 2)}\n`, 'utf8');
    await rename(temporary, this.filePath);
  }
}
