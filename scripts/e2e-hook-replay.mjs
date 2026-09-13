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

  return Response.json({
    id: 'resp_owned_hook_replay',
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: 'gpt-5.6-sol',
    output: [
      {
        type: 'function_call',
        id: 'fc_replay',
        call_id: 'call_replay',
        name: 'write_file',
        arguments: JSON.stringify({ path: 'src/App.tsx', content }),
        status: 'completed',
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  });
}
