import { type MetaFunction } from '@remix-run/cloudflare';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';

export const meta: MetaFunction = () => {
  return [
    { title: 'New Features - Bolt' },
    { name: 'description', content: 'Latest features and capabilities in Bolt' },
  ];
};

export default function Features() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold text-bolt-elements-textPrimary mb-8">New Features</h1>

          <div className="space-y-8">
            {/* AI Mode Selection Section */}
            <section className="bg-bolt-elements-background-depth-2 rounded-lg p-6 border border-bolt-elements-borderColor">
              <h2 className="text-2xl font-semibold text-bolt-elements-textPrimary mb-4">🎯 AI Mode Selection</h2>
              <p className="text-bolt-elements-textSecondary mb-6">
                Choose between Standard Mode and Multi-Model Orchestration before starting your chat session. Each mode
                is optimized for different types of tasks and complexity levels.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-3">Available Modes</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-bolt-elements-background-depth-3 rounded p-4 border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="i-ph:user-circle text-blue-600" />
                        <h4 className="font-medium text-bolt-elements-textPrimary">Standard Mode</h4>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-sm text-bolt-elements-textSecondary">
                        <li>Single AI conversation</li>
                        <li>Fast response times</li>
                        <li>Direct interaction</li>
                        <li>Simple workflow</li>
                        <li>Cost effective</li>
                      </ul>
                    </div>
                    <div className="bg-bolt-elements-background-depth-3 rounded p-4 border border-purple-200">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="i-ph:brain text-purple-600" />
                        <h4 className="font-medium text-bolt-elements-textPrimary">Multi-Model Orchestration</h4>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-sm text-bolt-elements-textSecondary">
                        <li>Multiple AI agents in parallel</li>
                        <li>Task decomposition and delegation</li>
                        <li>Cross-model validation and review</li>
                        <li>Advanced error detection and healing</li>
                        <li>Consensus-based results</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-3">How to Use</h3>
                  <div className="space-y-4">
                    <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">
                        Step 1: Visit the Chat Interface
                      </h4>
                      <p className="text-sm text-bolt-elements-textSecondary">
                        Navigate to the main chat interface. Before starting any conversation, you'll be presented with
                        the AI Mode Selection modal.
                      </p>
                    </div>

                    <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">Step 2: Choose Your Mode</h4>
                      <p className="text-sm text-bolt-elements-textSecondary">
                        Review the comparison table and select either Standard Mode for quick tasks or Multi-Model
                        Orchestration for complex projects requiring multiple perspectives.
                      </p>
                    </div>

                    <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">Step 3: Start Your Session</h4>
                      <p className="text-sm text-bolt-elements-textSecondary">
                        Click "Start" to begin your chat session with the selected mode. You can change the mode later
                        by clicking the "Change" button in the intro section.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-3">When to Use Each Mode</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">Standard Mode is Best For:</h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-bolt-elements-textSecondary">
                        <li>Quick questions and answers</li>
                        <li>Simple coding tasks</li>
                        <li>Learning and exploration</li>
                        <li>General conversations</li>
                        <li>Single-step problems</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">
                        Orchestration Mode is Best For:
                      </h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-bolt-elements-textSecondary">
                        <li>Complex software development</li>
                        <li>Code review and quality assurance</li>
                        <li>Multi-perspective analysis</li>
                        <li>Large-scale refactoring</li>
                        <li>Critical system design</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Multi-Model Orchestration Section */}
            <section className="bg-bolt-elements-background-depth-2 rounded-lg p-6 border border-bolt-elements-borderColor">
              <h2 className="text-2xl font-semibold text-bolt-elements-textPrimary mb-4">
                🚀 Multi-Model Orchestration
              </h2>
              <p className="text-bolt-elements-textSecondary mb-6">
                Run multiple AI agents in parallel for complex tasks with advanced error logging and self-healing
                capabilities.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-3">Key Features</h3>
                  <ul className="list-disc list-inside space-y-2 text-bolt-elements-textSecondary">
                    <li>Parallel execution of multiple AI agents for complex tasks</li>
                    <li>Advanced error logging with pattern detection and self-healing</li>
                    <li>Intelligent task decomposition and delegation strategies</li>
                    <li>Result aggregation using consensus mechanisms</li>
                    <li>Performance monitoring and metrics collection</li>
                    <li>Configurable orchestration strategies</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-3">How to Use</h3>
                  <div className="space-y-4">
                    <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">
                        Step 1: Import the Orchestration System
                      </h4>
                      <pre className="text-sm text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 rounded p-2 overflow-x-auto">
                        {`import { OrchestrationManager } from '~/lib/modules/orchestration/orchestration-manager';
import { TaskDecomposer } from '~/lib/modules/orchestration/task-decomposer';
import { ConsensusManager } from '~/lib/modules/orchestration/consensus-manager';`}
                      </pre>
                    </div>

                    <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">
                        Step 2: Create and Configure Orchestration Manager
                      </h4>
                      <pre className="text-sm text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 rounded p-2 overflow-x-auto">
                        {`const orchestrationManager = new OrchestrationManager({
  maxConcurrentAgents: 4,
  defaultTimeout: 30000,
  retryAttempts: 3,
  enableSelfHealing: true
});`}
                      </pre>
                    </div>

                    <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">Step 3: Define Your Task</h4>
                      <pre className="text-sm text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 rounded p-2 overflow-x-auto">
                        {`const task = {
  id: 'complex-analysis-task',
  type: 'analysis',
  description: 'Analyze codebase and suggest improvements',
  priority: 'high',
  requirements: ['security', 'performance', 'maintainability'],
  constraints: { maxTime: 300000 },
  metadata: { projectType: 'web-app' }
};`}
                      </pre>
                    </div>

                    <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">
                        Step 4: Execute Task with Multiple Agents
                      </h4>
                      <pre className="text-sm text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 rounded p-2 overflow-x-auto">
                        {`// Execute task with orchestration
const results = await orchestrationManager.executeTask(task);

// Or execute multiple tasks in parallel
const parallelTasks = [task1, task2, task3];
const parallelResults = await orchestrationManager.executeParallelTasks(parallelTasks);`}
                      </pre>
                    </div>

                    <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">Step 5: Get Consensus Results</h4>
                      <pre className="text-sm text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 rounded p-2 overflow-x-auto">
                        {`const consensusManager = new ConsensusManager();
const consensus = await consensusManager.achieveConsensus(
  task,
  results,
  'weighted_average' // or 'majority_vote', 'quality_based'
);

console.log('Final result:', consensus.result);
console.log('Confidence:', consensus.confidence);`}
                      </pre>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-3">Advanced Configuration</h3>
                  <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                    <h4 className="font-medium text-bolt-elements-textPrimary mb-2">
                      Custom Error Handling and Self-Healing
                    </h4>
                    <pre className="text-sm text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 rounded p-2 overflow-x-auto">
                      {`import { ErrorLogger } from '~/lib/modules/orchestration/error-logger';

const errorLogger = new ErrorLogger({
  enableSelfHealing: true,
  healingStrategies: ['retry', 'fallback', 'agent_replacement'],
  maxHealingAttempts: 3
});

// Monitor and heal errors automatically
orchestrationManager.setErrorLogger(errorLogger);`}
                    </pre>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-3">Use Cases</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">Code Review</h4>
                      <p className="text-sm text-bolt-elements-textSecondary">
                        Multiple agents analyze code for security, performance, and best practices simultaneously.
                      </p>
                    </div>
                    <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">Testing Strategy</h4>
                      <p className="text-sm text-bolt-elements-textSecondary">
                        Parallel generation of unit tests, integration tests, and end-to-end tests.
                      </p>
                    </div>
                    <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">Documentation</h4>
                      <p className="text-sm text-bolt-elements-textSecondary">
                        Generate comprehensive documentation from multiple perspectives and expertise areas.
                      </p>
                    </div>
                    <div className="bg-bolt-elements-background-depth-3 rounded p-4">
                      <h4 className="font-medium text-bolt-elements-textPrimary mb-2">Architecture Analysis</h4>
                      <p className="text-sm text-bolt-elements-textSecondary">
                        Multi-agent analysis of system architecture with different specialization focuses.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Placeholder for Future Features */}
            <section className="bg-bolt-elements-background-depth-2 rounded-lg p-6 border border-bolt-elements-borderColor">
              <h2 className="text-2xl font-semibold text-bolt-elements-textPrimary mb-4">
                🔮 More Features Coming Soon
              </h2>
              <p className="text-bolt-elements-textSecondary">
                This document will be updated as we continue to develop new features and capabilities. Stay tuned for
                more exciting additions to Bolt!
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
