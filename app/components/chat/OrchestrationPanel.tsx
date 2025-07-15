import { useStore } from '@nanostores/react';
import { orchestrationStore } from '~/lib/stores/orchestration';
import { formatDistanceToNow } from 'date-fns';

export function OrchestrationPanel() {
  const session = useStore(orchestrationStore.currentSession);
  const metrics = useStore(orchestrationStore.metrics);
  const showPanel = useStore(orchestrationStore.showPanel);

  if (!showPanel || !session) {
    return null;
  }

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'code':
        return 'i-ph:code';
      case 'review':
        return 'i-ph:magnifying-glass';
      case 'test':
        return 'i-ph:test-tube';
      case 'documentation':
        return 'i-ph:file-text';
      default:
        return 'i-ph:circle';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'in_progress':
        return 'text-blue-600';
      default:
        return 'text-bolt-elements-textSecondary';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-[60vh] bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="i-ph:brain text-purple-600 text-xl" />
            <h3 className="font-semibold text-bolt-elements-textPrimary">Orchestration Panel</h3>
          </div>
          <button
            onClick={() => orchestrationStore.togglePanel()}
            className="p-1 hover:bg-bolt-elements-background-depth-3 rounded"
          >
            <div className="i-ph:x text-bolt-elements-textSecondary" />
          </button>
        </div>

        {/* Models */}
        <div className="mt-2 flex gap-2">
          {session.models.map((model, idx) => (
            <div key={idx} className="text-xs px-2 py-1 bg-bolt-elements-background-depth-3 rounded-full">
              {model.provider.name}: {model.model}
            </div>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div className="p-4 grid grid-cols-4 gap-2 border-b border-bolt-elements-borderColor">
        <div className="text-center">
          <div className="text-2xl font-bold text-bolt-elements-textPrimary">{metrics.totalTasks}</div>
          <div className="text-xs text-bolt-elements-textSecondary">Total</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {metrics.totalTasks - metrics.completedTasks - metrics.failedTasks}
          </div>
          <div className="text-xs text-bolt-elements-textSecondary">Active</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{metrics.completedTasks}</div>
          <div className="text-xs text-bolt-elements-textSecondary">Done</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">{metrics.failedTasks}</div>
          <div className="text-xs text-bolt-elements-textSecondary">Failed</div>
        </div>
      </div>

      {/* Tasks */}
      <div className="overflow-y-auto max-h-[calc(60vh-200px)]">
        {session.tasks.length === 0 ? (
          <div className="p-8 text-center text-bolt-elements-textSecondary">
            <div className="i-ph:hourglass text-4xl mb-2" />
            <p>Waiting for tasks...</p>
          </div>
        ) : (
          <div className="divide-y divide-bolt-elements-borderColor">
            {session.tasks.map((task) => (
              <div key={task.id} className="p-3 hover:bg-bolt-elements-background-depth-2">
                <div className="flex items-start gap-3">
                  <div className={`${getTaskIcon(task.type)} text-lg mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-bolt-elements-textPrimary capitalize">{task.type}</span>
                      <span className={`text-xs ${getStatusColor(task.status)}`}>{task.status.replace('_', ' ')}</span>
                    </div>
                    <p className="text-xs text-bolt-elements-textSecondary mt-1 line-clamp-2">{task.description}</p>
                    {task.assignedModel && (
                      <p className="text-xs text-bolt-elements-textTertiary mt-1">Assigned to: {task.assignedModel}</p>
                    )}
                    {task.startTime && (
                      <p className="text-xs text-bolt-elements-textTertiary mt-1">
                        Started {formatDistanceToNow(task.startTime)} ago
                      </p>
                    )}
                    {task.error && <p className="text-xs text-red-500 mt-1">{task.error}</p>}
                  </div>
                  {task.status === 'in_progress' && <div className="animate-spin i-ph:circle-notch text-blue-600" />}
                  {task.status === 'completed' && <div className="i-ph:check-circle text-green-600" />}
                  {task.status === 'failed' && <div className="i-ph:x-circle text-red-600" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {session.startTime && (
        <div className="p-3 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-xs text-bolt-elements-textSecondary">
          Session started {formatDistanceToNow(session.startTime)} ago
          {metrics.averageTaskTime > 0 && (
            <span className="ml-2">• Avg time: {Math.round(metrics.averageTaskTime / 1000)}s</span>
          )}
        </div>
      )}
    </div>
  );
}
