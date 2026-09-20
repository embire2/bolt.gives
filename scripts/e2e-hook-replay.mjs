// Owned browser regression fixture only, never a production provider or a live-generation pass.
export function hookReplayResponse(body) {
  const marker = String(body).match(/PHASE1_[a-z0-9]+/)?.[0];

  if (!marker) {
    throw new Error('Hook replay requires the owned task-board fixture.');
  }

  const followup = String(body).includes(`${marker}_FOLLOWUP`);
  const content = `import { useState } from 'react';
import './App.css';
interface Task { id: number; title: string; }
export default function App() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, title: 'Design the layout' },
    { id: 2, title: 'Write the components' },
    { id: 3, title: 'Test the board' },
  ]);
  const [title, setTitle] = useState('');
  const addTask = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTasks([...tasks, { id: Date.now(), title: trimmed }]);
    setTitle('');
  };
  return <main className="app">
    <h1>${marker}</h1>
    ${followup ? `<p>${marker}_FOLLOWUP</p>` : ''}
    <div className="add-row">
      <input type="text" placeholder="Task title" value={title}
        onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
      <button onClick={addTask}>Add task</button>
    </div>
    <div className="board">{tasks.map(task => <div className="card" key={task.id}>{task.title}</div>)}</div>
  </main>;
}`;

  const artifact = `<boltArtifact id="owned-replay" title="Owned task board"><boltAction type="file" filePath="src/App.tsx">${content}</boltAction></boltArtifact>`;
  const meta = { id: 'owned_hook_replay', created: Math.floor(Date.now() / 1000), model: 'z-ai/glm-5.3-flash' };
  const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };

  if (!JSON.parse(String(body)).stream) {
    return Response.json({
      ...meta,
      object: 'chat.completion',
      choices: [{ index: 0, message: { role: 'assistant', content: artifact }, finish_reason: 'stop' }],
      usage,
    });
  }

  const events = [
    {
      ...meta,
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { role: 'assistant', content: artifact }, finish_reason: null }],
    },
    { ...meta, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
  ];

  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
