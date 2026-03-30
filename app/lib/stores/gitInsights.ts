import { atom } from 'nanostores';
import { gitHubApiService, type CommitHeatmapData, type AuthorStats } from '~/lib/services/githubApiService';
import { analysisService, type AnalysisResult } from '~/lib/services/analysisService';
import { workbenchStore } from './workbench';

export interface GitInsightsState {
  isLoading: boolean;
  heatmapData: CommitHeatmapData[];
  contributors: AuthorStats[];
  currentRepo: string | null;
  analysisResult: AnalysisResult | null;
  error: string | null;
}

const initialState: GitInsightsState = {
  isLoading: false,
  heatmapData: [],
  contributors: [],
  currentRepo: null,
  analysisResult: null,
  error: null,
};

export const gitInsightsStore = atom<GitInsightsState>(initialState);

export const gitInsightsActions = {
  /**
   * Load Git insights for a repository
   */
  async loadInsights(repoFullName: string) {
    const [owner, repo] = repoFullName.split('/');

    gitInsightsStore.set({ ...gitInsightsStore.get(), isLoading: true, error: null, currentRepo: repoFullName });

    try {
      const [heatmapData, contributors] = await Promise.all([
        gitHubApiService.getCommitHeatmap(owner, repo),
        gitHubApiService.getTopContributors(owner, repo, 10),
      ]);

      gitInsightsStore.set({
        ...gitInsightsStore.get(),
        isLoading: false,
        heatmapData,
        contributors,
      });
    } catch (error) {
      console.error('Failed to load Git insights:', error);
      gitInsightsStore.set({
        ...gitInsightsStore.get(),
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load insights',
      });
    }
  },

  /**
   * Run security scan on current workspace
   */
  async runSecurityScan() {
    gitInsightsStore.set({ ...gitInsightsStore.get(), isLoading: true, error: null });

    try {
      const files = workbenchStore.files.get();
      const filesToAnalyze: Record<string, { content: string; path: string }> = {};

      for (const [filePath, dirent] of Object.entries(files)) {
        if (dirent && dirent.type === 'file' && dirent.content) {
          filesToAnalyze[filePath] = {
            content: dirent.content,
            path: filePath,
          };
        }
      }

      const result = await analysisService.analyzeFiles(filesToAnalyze);

      gitInsightsStore.set({
        ...gitInsightsStore.get(),
        isLoading: false,
        analysisResult: result,
      });

      return result;
    } catch (error) {
      console.error('Security scan failed:', error);
      gitInsightsStore.set({
        ...gitInsightsStore.get(),
        isLoading: false,
        error: error instanceof Error ? error.message : 'Security scan failed',
      });
      throw error;
    }
  },

  /**
   * Generate documentation for current workspace
   */
  async generateDocs(filePath?: string) {
    gitInsightsStore.set({ ...gitInsightsStore.get(), isLoading: true, error: null });

    try {
      const files = workbenchStore.files.get();

      if (filePath) {
        // Generate docs for specific file
        const dirent = files[filePath];

        if (!dirent || dirent.type !== 'file' || !dirent.content) {
          throw new Error(`File not found: ${filePath}`);
        }

        const result = await analysisService.generateDocumentation(filePath, dirent.content);

        // Create a new file with the documentation
        const docPath = filePath.replace(/\.[^.]+$/, '.docs.md');
        await workbenchStore.createFile(docPath, result.content);
      } else {
        // Generate README for the project
        const filesToAnalyze: Record<string, { content: string; path: string }> = {};

        for (const [filePath, dirent] of Object.entries(files)) {
          if (dirent && dirent.type === 'file' && dirent.content) {
            filesToAnalyze[filePath] = {
              content: dirent.content,
              path: filePath,
            };
          }
        }

        const projectName = 'Current Project';
        const readmeContent = await analysisService.generateProjectReadme(filesToAnalyze, projectName);

        // Create or update README
        await workbenchStore.createFile('README.md', readmeContent);
      }

      gitInsightsStore.set({ ...gitInsightsStore.get(), isLoading: false });
    } catch (error) {
      console.error('Documentation generation failed:', error);
      gitInsightsStore.set({
        ...gitInsightsStore.get(),
        isLoading: false,
        error: error instanceof Error ? error.message : 'Documentation generation failed',
      });
      throw error;
    }
  },

  /**
   * Clear insights data
   */
  clear() {
    gitInsightsStore.set(initialState);
  },

  /**
   * Set the AI model for documentation generation
   */
  setModel(model: any) {
    analysisService.setModel(model);
  },
};
