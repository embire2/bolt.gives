import { atom, map } from 'nanostores';
import type { SelectedModel } from '~/components/chat/MultiModelSelector';
import { logStore } from './logs';

export interface OrchestrationTask {
  id: string;
  type: 'code' | 'review' | 'test' | 'documentation';
  description: string;
  assignedModel?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface OrchestrationSession {
  id: string;
  models: SelectedModel[];
  tasks: OrchestrationTask[];
  status: 'idle' | 'running' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  consensusResults?: Record<string, any>;
}

class OrchestrationStore {
  // Current session
  currentSession = atom<OrchestrationSession | null>(null);

  // Task queue
  taskQueue = map<Record<string, OrchestrationTask>>({});

  // Execution metrics
  metrics = atom({
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageTaskTime: 0,
  });

  // Panel visibility
  showPanel = atom(false);

  constructor() {
    logStore.logInfo('OrchestrationStore: Initialized', {
      type: 'orchestration',
      message: 'OrchestrationStore initialized',
    });
  }

  // Start a new orchestration session
  startSession(models: SelectedModel[]) {
    const sessionId = `session_${Date.now()}`;
    const session: OrchestrationSession = {
      id: sessionId,
      models,
      tasks: [],
      status: 'idle',
      startTime: Date.now(),
    };

    this.currentSession.set(session);
    this.taskQueue.set({});

    logStore.logInfo('OrchestrationStore: Started new session', {
      type: 'orchestration',
      message: `Started new orchestration session ${sessionId}`,
      sessionId,
      models: models.map((m) => ({ provider: m.provider.name, model: m.model })),
    });

    return session;
  }

  // Add a task to the queue
  addTask(task: Omit<OrchestrationTask, 'id' | 'status'>) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullTask: OrchestrationTask = {
      ...task,
      id: taskId,
      status: 'pending',
    };

    this.taskQueue.setKey(taskId, fullTask);

    const session = this.currentSession.get();

    if (session) {
      session.tasks.push(fullTask);
      this.currentSession.set({ ...session });
    }

    logStore.logInfo('OrchestrationStore: Added task', {
      type: 'orchestration',
      message: `Added ${task.type} task ${taskId}`,
      taskId,
      taskType: task.type,
      description: task.description.substring(0, 100),
    });

    return fullTask;
  }

  // Update task status
  updateTask(taskId: string, updates: Partial<OrchestrationTask>) {
    const task = this.taskQueue.get()[taskId];

    if (!task) {
      logStore.logWarning('OrchestrationStore: Task not found', { taskId });
      return;
    }

    const updatedTask = { ...task, ...updates };
    this.taskQueue.setKey(taskId, updatedTask);

    // Update session tasks
    const session = this.currentSession.get();

    if (session) {
      const taskIndex = session.tasks.findIndex((t) => t.id === taskId);

      if (taskIndex >= 0) {
        session.tasks[taskIndex] = updatedTask;
        this.currentSession.set({ ...session });
      }
    }

    // Update metrics
    if (updates.status === 'completed' || updates.status === 'failed') {
      this._updateMetrics();
    }

    logStore.logInfo('OrchestrationStore: Updated task', {
      type: 'orchestration',
      message: `Updated task ${taskId}`,
      taskId,
      updates,
    });
  }

  // Update execution metrics
  private _updateMetrics() {
    const tasks = Object.values(this.taskQueue.get());
    const completedTasks = tasks.filter((t) => t.status === 'completed');
    const failedTasks = tasks.filter((t) => t.status === 'failed');

    let totalTime = 0;
    completedTasks.forEach((task) => {
      if (task.startTime && task.endTime) {
        totalTime += task.endTime - task.startTime;
      }
    });

    this.metrics.set({
      totalTasks: tasks.length,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      averageTaskTime: completedTasks.length > 0 ? totalTime / completedTasks.length : 0,
    });
  }

  // Complete the current session
  completeSession(consensusResults?: Record<string, any>) {
    const session = this.currentSession.get();

    if (!session) {
      logStore.logWarning('OrchestrationStore: No active session to complete');
      return;
    }

    const completedSession: OrchestrationSession = {
      ...session,
      status: 'completed',
      endTime: Date.now(),
      consensusResults,
    };

    this.currentSession.set(completedSession);

    logStore.logInfo('OrchestrationStore: Completed session', {
      type: 'orchestration',
      message: `Completed orchestration session ${session.id}`,
      sessionId: session.id,
      duration: completedSession.endTime! - completedSession.startTime!,
      tasksCompleted: session.tasks.filter((t) => t.status === 'completed').length,
      tasksFailed: session.tasks.filter((t) => t.status === 'failed').length,
    });
  }

  // Toggle panel visibility
  togglePanel() {
    const currentVisibility = this.showPanel.get();
    this.showPanel.set(!currentVisibility);
    logStore.logInfo('OrchestrationStore: Toggled panel', {
      type: 'orchestration',
      message: `Toggled orchestration panel to ${!currentVisibility ? 'visible' : 'hidden'}`,
      visible: !currentVisibility,
    });
  }

  // Clear current session
  clearSession() {
    this.currentSession.set(null);
    this.taskQueue.set({});
    this.metrics.set({
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskTime: 0,
    });
    logStore.logInfo('OrchestrationStore: Cleared session', {
      type: 'orchestration',
      message: 'Cleared orchestration session',
    });
  }
}

export const orchestrationStore = new OrchestrationStore();
