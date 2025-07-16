import { useState } from 'react';
import { Button } from '~/components/ui/Button';
import { MultiModelSelector, type SelectedModel } from './MultiModelSelector';

interface ModeSelectorProps {
  onModeSelect: (mode: 'standard' | 'orchestration', models?: SelectedModel[]) => void;
  onClose?: () => void;
}

export function ModeSelector({ onModeSelect, onClose }: ModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<'standard' | 'orchestration' | null>(null);
  const [showMultiModelSelector, setShowMultiModelSelector] = useState(false);

  const handleConfirm = () => {
    if (selectedMode) {
      if (selectedMode === 'orchestration') {
        setShowMultiModelSelector(true);
      } else {
        onModeSelect(selectedMode);
      }
    }
  };

  const handleModelsSelected = (models: SelectedModel[]) => {
    onModeSelect('orchestration', models);
    setShowMultiModelSelector(false);
  };

  const modes = [
    {
      id: 'standard' as const,
      title: 'Standard Mode',
      subtitle: 'Single AI Assistant',
      description: 'Work with one AI model at a time for straightforward tasks and conversations.',
      features: [
        'Single AI conversation',
        'Fast response times',
        'Direct interaction',
        'Simple workflow',
        'Cost effective',
      ],
      bestFor: [
        'Quick questions and answers',
        'Simple coding tasks',
        'Learning and exploration',
        'General conversations',
        'Single-step problems',
      ],
      icon: 'i-ph:user-circle',
      color: 'blue',
    },
    {
      id: 'orchestration' as const,
      title: 'Multi-Model Orchestration',
      subtitle: 'Multiple AI Agents Working Together',
      description: 'Deploy multiple AI models simultaneously for complex tasks requiring diverse expertise.',
      features: [
        'Multiple AI agents in parallel',
        'Task decomposition and delegation',
        'Cross-model validation and review',
        'Advanced error detection and healing',
        'Consensus-based results',
      ],
      bestFor: [
        'Complex software development',
        'Code review and quality assurance',
        'Multi-perspective analysis',
        'Large-scale refactoring',
        'Critical system design',
      ],
      icon: 'i-ph:brain',
      color: 'purple',
    },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] m-4 overflow-auto">
          <div className="p-6 border-b border-bolt-elements-borderColor">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">Choose Your AI Mode</h2>
                <p className="text-sm text-bolt-elements-textSecondary mt-1">
                  Select how you want to work with AI models for this session
                </p>
              </div>
              {onClose && (
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <div className="i-ph:x text-lg" />
                </Button>
              )}
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {modes.map((mode) => (
                <div
                  key={mode.id}
                  className={`relative border-2 rounded-lg p-6 cursor-pointer transition-all duration-200 ${
                    selectedMode === mode.id
                      ? `border-${mode.color}-500 bg-${mode.color}-50`
                      : 'border-bolt-elements-borderColor hover:border-bolt-elements-focus'
                  }`}
                  onClick={() => setSelectedMode(mode.id)}
                >
                  {selectedMode === mode.id && (
                    <div
                      className={`absolute top-3 right-3 w-6 h-6 bg-${mode.color}-500 rounded-full flex items-center justify-center`}
                    >
                      <div className="i-ph:check text-white text-sm" />
                    </div>
                  )}

                  <div className="flex items-start gap-4 mb-4">
                    <div className={`${mode.icon} text-2xl text-${mode.color}-600`} />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">{mode.title}</h3>
                      <p className="text-sm text-bolt-elements-textSecondary font-medium">{mode.subtitle}</p>
                    </div>
                  </div>

                  <p className="text-sm text-bolt-elements-textSecondary mb-4 leading-relaxed">{mode.description}</p>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Key Features:</h4>
                      <ul className="space-y-1">
                        {mode.features.map((feature, idx) => (
                          <li key={idx} className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
                            <div className="i-ph:check text-green-500 text-xs" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Best For:</h4>
                      <ul className="space-y-1">
                        {mode.bestFor.map((use, idx) => (
                          <li key={idx} className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
                            <div className="i-ph:arrow-right text-bolt-elements-textSecondary text-xs" />
                            <span>{use}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Comparison Table */}
            <div className="mt-8 p-4 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg">
              <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-4">Quick Comparison</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bolt-elements-borderColor">
                      <th className="text-left py-2 text-bolt-elements-textSecondary font-medium">Feature</th>
                      <th className="text-center py-2 text-bolt-elements-textSecondary font-medium">Standard Mode</th>
                      <th className="text-center py-2 text-bolt-elements-textSecondary font-medium">
                        Orchestration Mode
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-bolt-elements-textSecondary">
                    <tr className="border-b border-bolt-elements-borderColor">
                      <td className="py-2">Response Speed</td>
                      <td className="text-center py-2">
                        <div className="i-ph:lightning text-green-500" />
                      </td>
                      <td className="text-center py-2">
                        <div className="i-ph:clock text-yellow-500" />
                      </td>
                    </tr>
                    <tr className="border-b border-bolt-elements-borderColor">
                      <td className="py-2">Task Complexity</td>
                      <td className="text-center py-2">Simple to Medium</td>
                      <td className="text-center py-2">Medium to Complex</td>
                    </tr>
                    <tr className="border-b border-bolt-elements-borderColor">
                      <td className="py-2">Quality Assurance</td>
                      <td className="text-center py-2">Manual Review</td>
                      <td className="text-center py-2">
                        <div className="i-ph:shield-check text-green-500" />
                      </td>
                    </tr>
                    <tr className="border-b border-bolt-elements-borderColor">
                      <td className="py-2">Multiple Perspectives</td>
                      <td className="text-center py-2">
                        <div className="i-ph:x text-red-500" />
                      </td>
                      <td className="text-center py-2">
                        <div className="i-ph:check text-green-500" />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2">Resource Usage</td>
                      <td className="text-center py-2">Low</td>
                      <td className="text-center py-2">Higher</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-bolt-elements-borderColor">
              <div className="text-sm text-bolt-elements-textSecondary">
                {selectedMode ? (
                  <span>
                    You selected{' '}
                    <strong className="text-bolt-elements-textPrimary">
                      {modes.find((m) => m.id === selectedMode)?.title}
                    </strong>
                  </span>
                ) : (
                  'Please select a mode to continue'
                )}
              </div>
              <div className="flex items-center gap-3">
                {onClose && (
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                )}
                <Button
                  variant="default"
                  onClick={handleConfirm}
                  disabled={!selectedMode}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  <div className="i-ph:arrow-right text-sm mr-1" />
                  Start {selectedMode ? modes.find((m) => m.id === selectedMode)?.title : 'Session'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Model Selector */}
      {showMultiModelSelector && (
        <MultiModelSelector onModelsSelect={handleModelsSelected} onClose={() => setShowMultiModelSelector(false)} />
      )}
    </>
  );
}
