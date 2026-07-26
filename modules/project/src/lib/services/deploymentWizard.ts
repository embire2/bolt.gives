export type DeploymentProvider = 'netlify' | 'vercel' | 'github-pages';

export interface DeploymentConfigInput {
  provider: DeploymentProvider;
  projectName: string;
  buildCommand?: string;
  outputDirectory?: string;
  nodeVersion?: string;
}

export interface GeneratedDeploymentFile {
  path: string;
  content: string;
}

function githubWorkflowForNetlify(input: DeploymentConfigInput) {
  return `name: deploy-netlify
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '${input.nodeVersion || '20'}'
      - run: pnpm install
      - run: ${input.buildCommand || 'pnpm run build'}
      - name: Deploy to Netlify
        run: npx netlify deploy --dir=${input.outputDirectory || 'dist'} --prod --site=$NETLIFY_SITE_ID
        env:
          NETLIFY_AUTH_TOKEN: \${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: \${{ secrets.NETLIFY_SITE_ID }}
`;
}

function githubWorkflowForVercel(input: DeploymentConfigInput) {
  return `name: deploy-vercel
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '${input.nodeVersion || '20'}'
      - run: pnpm install
      - run: npm i -g vercel
      - run: vercel pull --yes --environment=production --token=$VERCEL_TOKEN
      - run: vercel build --prod --token=$VERCEL_TOKEN
      - run: vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
        env:
          VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
`;
}

function githubPagesWorkflow(input: DeploymentConfigInput) {
  return `name: deploy-github-pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '${input.nodeVersion || '20'}'
      - run: pnpm install
      - run: ${input.buildCommand || 'pnpm run build'}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ${input.outputDirectory || 'dist'}
  deploy:
    runs-on: ubuntu-latest
    needs: build
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;
}

export function generateDeploymentFiles(input: DeploymentConfigInput): GeneratedDeploymentFile[] {
  if (input.provider === 'netlify') {
    return [
      {
        path: '.github/workflows/deploy-netlify.yml',
        content: githubWorkflowForNetlify(input),
      },
    ];
  }

  if (input.provider === 'vercel') {
    return [
      {
        path: '.github/workflows/deploy-vercel.yml',
        content: githubWorkflowForVercel(input),
      },
    ];
  }

  return [
    {
      path: '.github/workflows/deploy-pages.yml',
      content: githubPagesWorkflow(input),
    },
  ];
}

export async function rollbackDeployment(options: {
  provider: DeploymentProvider;
  deploymentId: string;
  token: string;
}) {
  if (options.provider === 'vercel') {
    const response = await fetch(`https://api.vercel.com/v13/deployments/${options.deploymentId}/promote`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json();
  }

  if (options.provider === 'netlify') {
    const response = await fetch(`https://api.netlify.com/api/v1/sites/${options.deploymentId}/rollback`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json();
  }

  throw new Error('Rollback for GitHub Pages must be done through GitHub deployment history.');
}
