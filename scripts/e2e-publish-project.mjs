import assert from 'node:assert/strict';

export async function verifyBrowserPublishing(page, context, { initialToken, followUpToken, output }) {
  const subdomain = `release-app-${Date.now()}`;
  page.once('dialog', (dialog) => dialog.accept(subdomain));

  const published = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/runtime\/sessions\/[^/]+\/publish$/.test(new URL(response.url()).pathname),
    { timeout: 240_000 },
  );
  await page.getByRole('button', { name: 'Deploy', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Publish FREE (*.instances.bolt.gives)' }).click();

  const response = await published;
  assert.equal(response.status(), 200, `Publishing failed: ${(await response.text()).slice(0, 250)}`);

  const { deployment } = await response.json();
  assert.equal(deployment.hostname, `${subdomain}.instances.bolt.gives`);

  const publicPage = await context.newPage();
  const errors = [];
  publicPage.on('pageerror', (error) => errors.push(error.message));

  const url = deployment.url || `https://${deployment.hostname}`;

  for (const route of ['/', '/release-acceptance-deep-link']) {
    const loaded = await publicPage.goto(`${url}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
    assert.equal(loaded.status(), 200);
    await publicPage.getByText(initialToken, { exact: false }).first().waitFor({ timeout: 20_000 });
    await publicPage.getByText(followUpToken, { exact: false }).first().waitFor({ timeout: 20_000 });
  }

  assert.deepEqual(errors, []);
  await publicPage.screenshot({ path: `${output}/05-public-project.png`, fullPage: true });
  await publicPage.close();

  return { ok: true, url, projectName: deployment.projectName, deploymentId: deployment.deploymentId };
}
