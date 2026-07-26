import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDeploymentFiles, rollbackDeployment } from './deploymentWizard';

describe('deploymentWizard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates expected workflow files for each provider', () => {
    const netlify = generateDeploymentFiles({
      provider: 'netlify',
      projectName: 'bolt.gives',
    });
    const vercel = generateDeploymentFiles({
      provider: 'vercel',
      projectName: 'bolt.gives',
    });
    const pages = generateDeploymentFiles({
      provider: 'github-pages',
      projectName: 'bolt.gives',
    });

    expect(netlify[0].path).toBe('.github/workflows/deploy-netlify.yml');
    expect(netlify[0].content).toContain('name: deploy-netlify');
    expect(netlify[0].content).toContain('npx netlify deploy');

    expect(vercel[0].path).toBe('.github/workflows/deploy-vercel.yml');
    expect(vercel[0].content).toContain('name: deploy-vercel');
    expect(vercel[0].content).toContain('vercel deploy --prebuilt --prod');

    expect(pages[0].path).toBe('.github/workflows/deploy-pages.yml');
    expect(pages[0].content).toContain('name: deploy-github-pages');
    expect(pages[0].content).toContain('uses: actions/deploy-pages@v4');
  });

  it('calls Vercel promote endpoint for rollback', async () => {
    const jsonPayload = { ok: true };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => jsonPayload,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await rollbackDeployment({
      provider: 'vercel',
      deploymentId: 'dep_123',
      token: 'secret',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.vercel.com/v13/deployments/dep_123/promote', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
    });
    expect(result).toEqual(jsonPayload);
  });

  it('calls Netlify rollback endpoint for rollback', async () => {
    const jsonPayload = { ok: true };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => jsonPayload,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await rollbackDeployment({
      provider: 'netlify',
      deploymentId: 'site_123',
      token: 'secret',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.netlify.com/api/v1/sites/site_123/rollback', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
    });
    expect(result).toEqual(jsonPayload);
  });
});
