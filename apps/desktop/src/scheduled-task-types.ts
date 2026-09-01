import type { AgentPermission } from '@fielora/contracts';

export type ScheduledTaskCadence = 'ONCE' | 'DAILY' | 'WEEKLY';
export type ScheduledTaskStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export interface ScheduledTaskView {
  id: string;
  name: string;
  task: string;
  field_id: string;
  conversation_id: string;
  provider_config_id: string;
  model_id: string | null;
  permission: AgentPermission;
  max_steps: number;
  cadence: ScheduledTaskCadence;
  local_time: string;
  weekday: number | null;
  run_at: number | null;
  timezone: string;
  status: ScheduledTaskStatus;
  next_run_at: number | null;
  last_run_at: number | null;
  last_agent_run_id: string | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateScheduledTaskRequest {
  name: string;
  task: string;
  field_id: string;
  conversation_id: string;
  provider_config_id: string;
  model_id: string | null;
  permission: AgentPermission;
  max_steps: number;
  cadence: ScheduledTaskCadence;
  local_time: string;
  weekday: number | null;
  run_at: number | null;
  timezone: string;
}

export interface UpdateScheduledTaskRequest extends Partial<Omit<CreateScheduledTaskRequest, 'field_id' | 'conversation_id'>> {
  id: string;
  status?: ScheduledTaskStatus;
}

export interface ScheduledTaskRequest { id: string }
