import { atom } from 'nanostores';

export interface CommitActivity {
  total: number;
  week: number;
  days: number[];
}

export interface ContributorStats {
  total: number;
  weeks: Array<{
    w: number;
    a: number;
    d: number;
    c: number;
  }>;
  author: {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  };
}

export interface CommitHeatmapData {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface AuthorStats {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  additions: number;
  deletions: number;
}

export interface SecurityVulnerability {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  file: string;
  line?: number;
  description: string;
  recommendation: string;
}

export interface CodeHealthIssue {
  type: 'bug' | 'performance' | 'maintainability' | 'security' | 'best-practice';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface AnalysisResult {
  timestamp: string;
  filesAnalyzed: number;
  securityVulnerabilities: SecurityVulnerability[];
  codeHealthIssues: CodeHealthIssue[];
  overallScore: number;
  summary: string;
}

// Git Insights Store
export interface GitInsightsState {
  isLoading: boolean;
  heatmapData: CommitHeatmapData[];
  contributors: AuthorStats[];
  currentRepo: string | null;
  analysisResult: AnalysisResult | null;
  error: string | null;
}

export const gitInsightsStore = atom<GitInsightsState>({
  isLoading: false,
  heatmapData: [],
  contributors: [],
  currentRepo: null,
  analysisResult: null,
  error: null,
});

// QR Code Store
export const expoUrlAtom = atom<string | null>(null);

// Theme Store
export interface ThemeColors {
  gradient: {
    start: string;
    mid: string;
    end: string;
  };
  crimson: string;
  azure: string;
  accent: string;
}

export const themeColors: ThemeColors = {
  gradient: {
    start: '#450A0A',
    mid: '#0A0A0A',
    end: '#051937',
  },
  crimson: '#450A0A',
  azure: '#051937',
  accent: '#8A5FFF',
};
