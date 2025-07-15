import type { Message } from 'ai';
import type { SelectedModel } from '~/components/chat/MultiModelSelector';
import { orchestrationStore } from '~/lib/stores/orchestration';
import { logStore } from '~/lib/stores/logs';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { IProviderSetting } from '~/types/model';

export interface OrchestrationRequest {
  message: string;
  models: SelectedModel[];
  onStream?: (text: string, modelIndex: number) => void;
  onComplete?: (results: OrchestrationResult[]) => void;
  onError?: (error: Error) => void;
}

export interface OrchestrationResult {
  modelIndex: number;
  provider: string;
  model: string;
  response: string;
  confidence?: number;
  errors?: string[];
}

export class OrchestrationManager {
  private static _instance: OrchestrationManager;
  private _abortControllers: Map<string, AbortController> = new Map();

  private constructor() {
    logStore.logInfo('OrchestrationManager: Initialized', {
      type: 'orchestration',
      message: 'OrchestrationManager initialized',
    });
  }

  static getInstance(): OrchestrationManager {
    if (!this._instance) {
      this._instance = new OrchestrationManager();
    }

    return this._instance;
  }

  async orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult[]> {
    const { message, models, onStream, onComplete, onError } = request;

    logStore.logInfo('OrchestrationManager: Starting orchestration', {
      type: 'orchestration',
      message: `Starting orchestration with ${models.length} models`,
      requestMessage: message.substring(0, 100),
      models: models.map((m) => ({ provider: m.provider.name, model: m.model })),
    });

    // Start orchestration session
    const session = orchestrationStore.startSession(models);

    // Create initial task decomposition
    const tasks = this._decomposeRequest(message);
    tasks.forEach((task) => orchestrationStore.addTask(task));

    try {
      // Execute tasks in parallel with different models
      const results = await Promise.all(
        models.map((selectedModel, index) => this._executeWithModel(selectedModel, message, index, tasks, onStream)),
      );

      // Perform consensus analysis
      const consensusResults = await this._analyzeConsensus(results);

      // Complete session
      orchestrationStore.completeSession(consensusResults);

      logStore.logInfo('OrchestrationManager: Orchestration completed', {
        type: 'orchestration',
        message: `Orchestration completed with ${results.length} results`,
        sessionId: session.id,
        resultsCount: results.length,
      });

      onComplete?.(results);

      return results;
    } catch (error) {
      logStore.logError('OrchestrationManager: Orchestration failed', error);
      orchestrationStore.updateTask(session.id, { status: 'failed', error: (error as Error).message });
      onError?.(error as Error);
      throw error;
    }
  }

  private _decomposeRequest(message: string): Array<Omit<any, 'id' | 'status'>> {
    // Analyze the request and create tasks
    const tasks = [];

    // Always add a primary code generation task
    tasks.push({
      type: 'code',
      description: `Generate code for: ${message.substring(0, 200)}...`,
    });

    // Add review task
    tasks.push({
      type: 'review',
      description: 'Review generated code for best practices and potential issues',
    });

    // Add test task if applicable
    if (message.toLowerCase().includes('test') || message.toLowerCase().includes('function')) {
      tasks.push({
        type: 'test',
        description: 'Generate test cases for the implementation',
      });
    }

    // Add documentation task for complex requests
    if (message.length > 200 || message.includes('\n')) {
      tasks.push({
        type: 'documentation',
        description: 'Generate documentation for the implementation',
      });
    }

    logStore.logInfo('OrchestrationManager: Decomposed request into tasks', {
      type: 'orchestration',
      message: `Decomposed request into ${tasks.length} tasks`,
      taskCount: tasks.length,
      types: tasks.map((t) => t.type),
    });

    return tasks;
  }

  private async _executeWithModel(
    selectedModel: SelectedModel,
    message: string,
    modelIndex: number,
    tasks: any[],
    onStream?: (text: string, modelIndex: number) => void,
  ): Promise<OrchestrationResult> {
    const taskId = `model_${modelIndex}_${Date.now()}`;
    const abortController = new AbortController();
    this._abortControllers.set(taskId, abortController);

    try {
      // Update task assignment
      tasks.forEach((task, index) => {
        if (index % 2 === modelIndex) {
          orchestrationStore.updateTask(task.id, {
            assignedModel: `${selectedModel.provider.name}/${selectedModel.model}`,
            status: 'in_progress',
            startTime: Date.now(),
          });
        }
      });

      // Get provider settings
      const settings: IProviderSetting = {
        enabled: true,
      };

      if (selectedModel.apiKey) {
        (settings as any).apiKey = selectedModel.apiKey;
      }

      // Create enhanced prompt for orchestration
      const enhancedPrompt = this._createEnhancedPrompt(message, modelIndex);

      // Execute with the model
      const llmManager = LLMManager.getInstance();
      const provider = llmManager.getProvider(selectedModel.provider.name);

      if (!provider) {
        throw new Error(`Provider ${selectedModel.provider.name} not found`);
      }

      let fullResponse = '';
      const messages: Message[] = [
        {
          id: `system_${Date.now()}`,
          role: 'system',
          content: 'You are part of a multi-model orchestration system. Provide high-quality, accurate responses.',
        },
        {
          id: `user_${Date.now()}`,
          role: 'user',
          content: enhancedPrompt,
        },
      ];

      // Stream the response
      const stream = await (provider as any).streamChat({
        messages,
        model: selectedModel.model,
        options: {
          signal: abortController.signal,
        },
      });

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullResponse += chunk.text;
          onStream?.(chunk.text, modelIndex);
        }
      }

      // Update completed tasks
      tasks.forEach((task, index) => {
        if (index % 2 === modelIndex) {
          orchestrationStore.updateTask(task.id, {
            status: 'completed',
            result: fullResponse.substring(0, 500),
            endTime: Date.now(),
          });
        }
      });

      logStore.logInfo('OrchestrationManager: Model execution completed', {
        type: 'orchestration',
        message: `Model execution completed for ${selectedModel.provider.name}`,
        provider: selectedModel.provider.name,
        model: selectedModel.model,
        responseLength: fullResponse.length,
      });

      return {
        modelIndex,
        provider: selectedModel.provider.name,
        model: selectedModel.model,
        response: fullResponse,
        confidence: 0.85, // Placeholder - could be calculated based on response quality
      };
    } catch (error) {
      logStore.logError('OrchestrationManager: Model execution failed', error, {
        provider: selectedModel.provider.name,
        model: selectedModel.model,
      });

      // Update failed tasks
      tasks.forEach((task, index) => {
        if (index % 2 === modelIndex) {
          orchestrationStore.updateTask(task.id, {
            status: 'failed',
            error: (error as Error).message,
            endTime: Date.now(),
          });
        }
      });

      return {
        modelIndex,
        provider: selectedModel.provider.name,
        model: selectedModel.model,
        response: '',
        errors: [(error as Error).message],
      };
    } finally {
      this._abortControllers.delete(taskId);
    }
  }

  private _createEnhancedPrompt(originalMessage: string, modelIndex: number): string {
    const role = modelIndex === 0 ? 'primary implementer' : 'reviewer and enhancer';

    return `As the ${role} in a multi-model orchestration system, ${originalMessage}

Please provide a comprehensive response that:
1. Addresses all aspects of the request
2. Includes error handling and edge cases
3. Follows best practices
4. Is well-documented
5. Can be validated by another AI model

Focus on quality and correctness over brevity.`;
  }

  private async _analyzeConsensus(results: OrchestrationResult[]): Promise<Record<string, any>> {
    logStore.logInfo('OrchestrationManager: Analyzing consensus', {
      type: 'orchestration',
      message: `Analyzing consensus for ${results.length} results`,
      resultCount: results.length,
    });

    const consensus = {
      agreement: false,
      confidence: 0,
      primaryResponse: '',
      conflicts: [] as string[],
      mergedResponse: '',
    };

    if (results.length === 0) {
      return consensus;
    }

    // For now, use a simple strategy - could be enhanced with more sophisticated analysis
    const validResults = results.filter((r) => r.response && !r.errors?.length);

    if (validResults.length === 0) {
      consensus.conflicts.push('All models failed to generate valid responses');
      return consensus;
    }

    // Check for agreement (simplified - could use semantic similarity)
    if (validResults.length > 1) {
      const responses = validResults.map((r) => r.response.toLowerCase().trim());
      const similarity = this._calculateSimilarity(responses[0], responses[1]);

      consensus.agreement = similarity > 0.7;
      consensus.confidence = similarity;
    }

    // Select best response based on confidence and length
    const bestResult = validResults.reduce((best, current) => {
      const currentScore = (current.confidence || 0.5) * Math.log(current.response.length + 1);
      const bestScore = (best.confidence || 0.5) * Math.log(best.response.length + 1);

      return currentScore > bestScore ? current : best;
    });

    consensus.primaryResponse = bestResult.response;
    consensus.mergedResponse = bestResult.response; // Could merge responses in future

    return consensus;
  }

  private _calculateSimilarity(str1: string, str2: string): number {
    // Simple Jaccard similarity for demonstration
    const set1 = new Set(str1.split(/\s+/));
    const set2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  abort(sessionId?: string) {
    if (sessionId) {
      // Abort specific session
      this._abortControllers.forEach((controller, id) => {
        if (id.includes(sessionId)) {
          controller.abort();
        }
      });
    } else {
      // Abort all
      this._abortControllers.forEach((controller) => controller.abort());
    }

    this._abortControllers.clear();
    logStore.logInfo('OrchestrationManager: Aborted orchestration', {
      type: 'orchestration',
      message: sessionId ? `Aborted orchestration session ${sessionId}` : 'Aborted all orchestration sessions',
      sessionId,
    });
  }
}
