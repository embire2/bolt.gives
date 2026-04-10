import Cookies from 'js-cookie';
import { Octokit } from '@octokit/rest';
import { extractRelativePath } from '~/utils/diff';
import type { FileMap } from '~/lib/stores/files';
import { GitLabApiService } from '~/lib/services/gitlabApiService';

interface PushWorkspaceToRepositoryOptions {
  provider: 'github' | 'gitlab';
  files: FileMap;
  repoName: string;
  commitMessage?: string;
  username?: string;
  token?: string;
  isPrivate?: boolean;
  branchName?: string;
}

export async function pushWorkspaceToRepository(options: PushWorkspaceToRepositoryOptions) {
  const { provider, files, repoName, commitMessage, username, token, isPrivate = false, branchName = 'main' } = options;
  const isGitHub = provider === 'github';
  const isGitLab = provider === 'gitlab';
  const authToken = token || Cookies.get(isGitHub ? 'githubToken' : 'gitlabToken');
  const owner = username || Cookies.get(isGitHub ? 'githubUsername' : 'gitlabUsername');

  if (!authToken || !owner) {
    throw new Error(`${provider} token or username is not set in cookies or provided.`);
  }

  if (!files || Object.keys(files).length === 0) {
    throw new Error('No files found to push');
  }

  if (isGitHub) {
    const octokit = new Octokit({ auth: authToken });
    let repo: any;
    let visibilityJustChanged = false;

    try {
      const resp = await octokit.repos.get({ owner, repo: repoName });
      repo = resp.data;

      if (repo.private !== isPrivate) {
        const { data: updatedRepo } = await octokit.repos.update({
          owner,
          repo: repoName,
          private: isPrivate,
        });
        repo = updatedRepo;
        visibilityJustChanged = true;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 404) {
        const { data: newRepo } = await octokit.repos.createForAuthenticatedUser({
          name: repoName,
          private: isPrivate,
          auto_init: true,
        });
        repo = newRepo;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        throw error;
      }
    }

    const pushFilesToRepo = async (attempt = 1): Promise<string> => {
      const maxAttempts = 3;

      try {
        const blobs = await Promise.all(
          Object.entries(files).map(async ([filePath, dirent]) => {
            if (dirent?.type === 'file' && dirent.content) {
              const { data: blob } = await octokit.git.createBlob({
                owner: repo.owner.login,
                repo: repo.name,
                content: Buffer.from(dirent.content).toString('base64'),
                encoding: 'base64',
              });
              return { path: extractRelativePath(filePath), sha: blob.sha };
            }

            return null;
          }),
        );

        const validBlobs = blobs.filter(Boolean);

        if (validBlobs.length === 0) {
          throw new Error('No valid files to push');
        }

        const repoRefresh = await octokit.repos.get({ owner, repo: repoName });
        repo = repoRefresh.data;

        const { data: ref } = await octokit.git.getRef({
          owner: repo.owner.login,
          repo: repo.name,
          ref: `heads/${repo.default_branch || 'main'}`,
        });
        const latestCommitSha = ref.object.sha;

        const { data: newTree } = await octokit.git.createTree({
          owner: repo.owner.login,
          repo: repo.name,
          base_tree: latestCommitSha,
          tree: validBlobs.map((blob) => ({
            path: blob!.path,
            mode: '100644',
            type: 'blob',
            sha: blob!.sha,
          })),
        });

        const { data: newCommit } = await octokit.git.createCommit({
          owner: repo.owner.login,
          repo: repo.name,
          message: commitMessage || 'Initial commit from your app',
          tree: newTree.sha,
          parents: [latestCommitSha],
        });

        await octokit.git.updateRef({
          owner: repo.owner.login,
          repo: repo.name,
          ref: `heads/${repo.default_branch || 'main'}`,
          sha: newCommit.sha,
        });

        return repo.html_url;
      } catch (error) {
        if ((visibilityJustChanged || attempt === 1) && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
          return pushFilesToRepo(attempt + 1);
        }

        throw error;
      }
    };

    return pushFilesToRepo();
  }

  if (isGitLab) {
    const gitLabApiService = new GitLabApiService(authToken, 'https://gitlab.com');
    let repo = await gitLabApiService.getProject(owner, repoName);

    if (!repo) {
      repo = await gitLabApiService.createProject(repoName, isPrivate);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const branchRes = await gitLabApiService.getFile(repo.id, 'README.md', branchName).catch(() => null);

    if (!branchRes || !branchRes.ok) {
      await gitLabApiService.createBranch(repo.id, branchName, repo.default_branch);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const actions = Object.entries(files).reduce(
      (acc, [filePath, dirent]) => {
        if (dirent?.type === 'file' && dirent.content) {
          acc.push({
            action: 'create',
            file_path: extractRelativePath(filePath),
            content: dirent.content,
          });
        }

        return acc;
      },
      [] as { action: 'create' | 'update'; file_path: string; content: string }[],
    );

    for (const action of actions) {
      const fileCheck = await gitLabApiService.getFile(repo.id, action.file_path, branchName);

      if (fileCheck.ok) {
        action.action = 'update';
      }
    }

    await gitLabApiService.commitFiles(repo.id, {
      branch: branchName,
      commit_message: commitMessage || 'Commit multiple files',
      actions,
    });

    return repo.web_url;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}
