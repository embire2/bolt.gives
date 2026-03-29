import { describe, expect, it } from 'vitest';
import { createHostedWebContainerStub } from './hosted-stub';

describe('createHostedWebContainerStub', () => {
  it('supports lightweight file operations without booting WebContainer', async () => {
    const container = await createHostedWebContainerStub();

    await container.fs.mkdir('src', { recursive: true });
    await container.fs.writeFile('src/App.jsx', 'export default function App() {}');

    const content = await container.fs.readFile('src/App.jsx', 'utf-8');
    const dirents = await container.fs.readdir('src', { withFileTypes: true });

    expect(content).toContain('function App');
    expect(dirents.some((entry) => entry.name === 'App.jsx' && entry.isFile())).toBe(true);
  });
});
