# Sub-Agent Framework

The Sub-Agent Framework is a stable, first-class feature of bolt.gives that enables manager/worker patterns for complex AI workflows. It provides a typed API for spawning, pausing, resuming, and canceling worker agents programmatically.

## Overview

The framework consists of three main components:

1. **SubAgentManager**: The main API for managing sub-agents
2. **AgentBus**: An in-process message bus for inter-agent communication
3. **SubAgent Types**: TypeScript definitions for type-safe sub-agent operations

## SubAgentManager API

### Getting the Manager Instance

```typescript
import { SubAgentManager } from '~/lib/.server/llm/sub-agent';

const manager = SubAgentManager.getInstance();
```

The SubAgentManager is a singleton - all parts of your application share the same instance.

### Registering Executors

Before spawning agents of a specific type, you must register an executor function:

```typescript
import type { SubAgentConfig, SubAgentExecutionResult } from '~/lib/.server/llm/sub-agent';

const plannerExecutor = async (
  agentId: string,
  messages: unknown[],
  config: SubAgentConfig,
  onProgress?: (state: SubAgentState, output: string) => void,
): Promise<SubAgentExecutionResult> => {
  // Your executor logic here
  return {
    success: true,
    output: 'Result',
    messages: [],
    metadata: {
      id: agentId,
      type: 'planner',
      state: 'completed',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  };
};

manager.registerExecutor('planner', plannerExecutor);
```

### Spawning Agents

Create a new sub-agent with the `spawn` method:

```typescript
const agentId = await manager.spawn(parentId, {
  type: 'planner',
  model: 'gpt-4',
  provider: 'openai',
  maxSteps: 5,
  priority: 1,
});
```

**Parameters:**
- `parentId?: string` - The ID of the parent/manager agent (optional)
- `config: SubAgentConfig` - Configuration for the agent

**Returns:** The ID of the newly created agent

### Starting Agents

Execute a spawned agent:

```typescript
const result = await manager.start(agentId, messages, (state, output) => {
  console.log(`Agent ${agentId} is now in state: ${state}`);
  console.log(`Output so far: ${output}`);
});

console.log('Success:', result.success);
console.log('Final output:', result.output);
```

**Parameters:**
- `agentId: string` - The ID of the agent to start
- `messages: unknown[]` - Input messages for the agent
- `onProgress?: (state: SubAgentState, output: string) => void` - Optional progress callback

**Returns:** `SubAgentExecutionResult` containing the result and metadata

### Pausing Agents

Pause an agent that's currently running:

```typescript
manager.pause(agentId);
```

**Note:** Only agents in `planning` or `executing` state can be paused.

### Resuming Agents

Resume a paused agent:

```typescript
manager.resume(agentId);
```

**Note:** Only agents in `paused` state can be resumed.

### Canceling Agents

Cancel an agent:

```typescript
manager.cancel(agentId);
```

**Note:** Cannot cancel agents that are already `completed`, `failed`, or `cancelled`.

### Querying Agent State

Get information about a specific agent:

```typescript
const agent = manager.getAgent(agentId);
console.log(agent.state);
console.log(agent.tokenUsage);
console.log(agent.plan);
```

Get all agents:

```typescript
const allAgents = manager.getAllAgents();
```

Filter agents by various criteria:

```typescript
// By parent
const workers = manager.getAgentsByParent(parentId);

// By state
const active = manager.getAgentsByState('executing');

// By type
const planners = manager.getAgentsByType('planner');
```

### Cleanup

Remove individual agents:

```typescript
manager.cleanup(agentId);
```

Remove all agents belonging to a parent:

```typescript
const count = manager.cleanupByParent(parentId);
console.log(`Cleaned up ${count} agents`);
```

Reset the entire manager (clear all agents):

```typescript
manager.reset();
```

## AgentBus API

The AgentBus provides a publish-subscribe messaging system for inter-agent communication.

### Publishing Messages

```typescript
import { AgentBus } from '~/lib/.server/llm/sub-agent';

const bus = AgentBus.getInstance();

await bus.publish({
  id: 'msg-1',
  from: 'agent-1',
  to: 'agent-2',
  timestamp: new Date().toISOString(),
  type: 'request',
  payload: { task: 'analyze', data: '...' },
});
```

### Subscribing to Messages

```typescript
const unsubscribe = bus.subscribe('agent-2', async (message) => {
  console.log('Received message:', message);
  // Handle the message
});

// Later, to unsubscribe:
unsubscribe();
```

### Querying Message History

Get all messages:

```typescript
const history = bus.getHistory();
```

Get messages for a specific agent:

```typescript
const agentHistory = bus.getHistory('agent-1', 50); // Last 50 messages
```

## Types

### SubAgentConfig

```typescript
interface SubAgentConfig {
  type: SubAgentType;
  model?: string;
  provider?: string;
  maxSteps?: number;
  priority?: number;
}
```

### SubAgentState

```typescript
type SubAgentState = 'idle' | 'planning' | 'executing' | 'paused' | 'completed' | 'failed' | 'cancelled';
```

### SubAgentType

```typescript
type SubAgentType = 'planner' | 'worker' | 'verifier' | 'custom';
```

### SubAgentMetadata

```typescript
interface SubAgentMetadata {
  id: string;
  type: SubAgentType;
  parentId?: string;
  state: SubAgentState;
  model?: string;
  provider?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  plan?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

### SubAgentExecutionResult

```typescript
interface SubAgentExecutionResult {
  success: boolean;
  output: string;
  messages: SubAgentMessage[];
  metadata: SubAgentMetadata;
}
```

## Built-in Planner Executor

The framework includes a built-in planner executor that generates implementation plans:

```typescript
import { createPlannerExecutor } from '~/lib/.server/llm/sub-agent/planner-executor';

const plannerExecutor = createPlannerExecutor(async (messages, config) => ({
  env: context.cloudflare?.env,
  options: { maxSteps: 1, tools: {}, toolChoice: undefined },
  apiKeys,
  files,
  providerSettings,
  // ... other parameters
}));

manager.registerExecutor('planner', plannerExecutor);
```

## Integration with Chat API

The Sub-Agent Framework is integrated into the main chat API (`/api.chat`). When a user requests a build-mode chat:

1. A planner agent is spawned automatically
2. The planner generates an execution plan
3. The plan is passed to the main worker agent
4. Sub-agent events are streamed to the frontend
5. The Execution Transparency Panel displays the sub-agent timeline

## Execution Transparency Panel

The sub-agent timeline is displayed in the Execution Transparency Panel, showing:

- Agent type (e.g., "Planner Agent")
- Current state (with color coding: green for completed, red for failed, yellow for in-progress)
- Model and provider used
- Token usage breakdown
- The generated plan (truncated to 200 characters)

## Best Practices

1. **Always register executors before spawning agents** of that type
2. **Use the progress callback** to provide real-time feedback during execution
3. **Cleanup agents** when they're no longer needed to prevent memory leaks
4. **Handle errors gracefully** - the manager will set the agent state to `failed` and store the error message
5. **Use the AgentBus** for inter-agent communication instead of direct function calls
6. **Monitor token usage** via the metadata to control costs

## Example: Full Workflow

```typescript
import { SubAgentManager } from '~/lib/.server/llm/sub-agent';
import type { SubAgentConfig, SubAgentState } from '~/lib/.server/llm/sub-agent';

const manager = SubAgentManager.getInstance();

// 1. Register executors
const plannerExecutor = async (agentId, messages, config, onProgress) => {
  onProgress?.('planning', 'Analyzing request...');
  // Generate plan
  return { success: true, output: plan, messages: [], metadata };
};

manager.registerExecutor('planner', plannerExecutor);

// 2. Spawn planner
const plannerId = await manager.spawn(undefined, {
  type: 'planner',
  model: 'gpt-4',
});

// 3. Start planner
const plannerResult = await manager.start(
  plannerId,
  messages,
  (state, output) => {
    console.log(`Planner ${state}: ${output}`);
  },
);

// 4. Spawn worker with plan context
const workerId = await manager.spawn(plannerId, {
  type: 'worker',
  model: 'gpt-4',
});

// 5. Start worker with the plan
const workerResult = await manager.start(workerId, [
  ...messages,
  { role: 'system', content: `Plan: ${plannerResult.output}` },
]);

// 6. Cleanup
manager.cleanup(plannerId);
manager.cleanup(workerId);
```

## Migration from BOLT_SUB_AGENTS_ENABLED Flag

If you were using the `BOLT_SUB_AGENTS_ENABLED` feature flag in v1.0.2, here's how to migrate:

### Before (v1.0.2 with flag)

```typescript
const subAgentsEnabled = isTruthyFlag(envVars?.BOLT_SUB_AGENTS_ENABLED);

if (subAgentsEnabled && chatMode === 'build') {
  // Inline planner logic
}
```

### After (v1.0.3 with stable API)

```typescript
import { SubAgentManager } from '~/lib/.server/llm/sub-agent';

const manager = SubAgentManager.getInstance();

// No feature flag needed - always enabled in build mode
if (chatMode === 'build') {
  const plannerId = await manager.spawn(undefined, { type: 'planner' });
  const result = await manager.start(plannerId, messages);
}
```

The framework is now stable and always available. No feature flag is required.

## Testing

The framework includes comprehensive unit tests:

```bash
pnpm test -- agent-bus.spec.ts
pnpm test -- sub-agent-manager.spec.ts
```

Tests cover:
- Singleton behavior
- Message publish/subscribe
- Agent lifecycle (spawn, start, pause, resume, cancel)
- Executor registration and execution
- Error handling
- Progress callbacks
- Filtering and querying
- Cleanup operations
