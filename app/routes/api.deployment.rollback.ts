import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { rollbackDeployment, type DeploymentProvider } from '~/lib/services/deploymentWizard';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = (await request.json()) as {
      provider: DeploymentProvider;
      deploymentId: string;
      token: string;
    };

    const result = await rollbackDeployment(body);

    return json({ result });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Rollback failed',
      },
      { status: 500 },
    );
  }
}
