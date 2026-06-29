export interface Task {
  id: string;
  name: string;
  deadline: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  timeSlot: string;     // e.g. "10:00 AM - 11:30 AM" or "Tonight 11:00 PM"
  steps: string[];       // actionable sequence of steps
  tips: string;          // custom advice or actionable strategy
  completed: boolean;
  progress: number;      // percent progress from 0 to 100
  actualTimeSpent: number; // accumulated time spent in seconds
  stepsGenerated?: boolean; 
  isGeneratingSteps?: boolean;
  deadlineTimestamp?: number; // millisecond timestamp for dynamic urgency calculations
  extensionCount?: number; // track number of deadline extensions
  googleEventId?: string; // Google Calendar Event ID if synced
  googleEventLink?: string; // Direct link to Google Calendar event if synced
}

export interface ParseResult {
  tasks: Omit<Task, 'id' | 'completed' | 'progress' | 'actualTimeSpent'>[];
  devilNudge: string;
}

export interface RescheduleResult {
  tasks: Omit<Task, 'id' | 'completed' | 'progress' | 'actualTimeSpent'>[];
  devilNudge: string;
}
