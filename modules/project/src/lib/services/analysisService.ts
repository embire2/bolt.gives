import { generateText } from 'ai';
import type { LanguageModelV1 } from 'ai';

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

export interface DocGenerationOptions {
  format: 'markdown' | 'html' | 'jsdoc';
  includeExamples?: boolean;
  includeTypeInfo?: boolean;
}

export interface GeneratedDocumentation {
  file: string;
  content: string;
  language: string;
}

export class AnalysisServiceClass {
  private _model: LanguageModelV1 | null = null;

  setModel(model: LanguageModelV1) {
    this._model = model;
  }

  /**
   * Analyze files for security vulnerabilities and code health issues
   */
  async analyzeFiles(files: Record<string, { content: string; path: string }>): Promise<AnalysisResult> {
    const filesArray = Object.entries(files).map(([path, file]) => ({
      path,
      content: file.content.substring(0, 5000), // Limit content size
    }));

    const vulnerabilities: SecurityVulnerability[] = [];
    const codeHealthIssues: CodeHealthIssue[] = [];
    let overallScore = 100;

    // Analyze each file for common issues
    for (const file of filesArray) {
      const issues = this._detectIssues(file.path, file.content);
      vulnerabilities.push(...issues.vulnerabilities);
      codeHealthIssues.push(...issues.healthIssues);
    }

    // Deduct points based on issues found
    const criticalVulns = vulnerabilities.filter((v) => v.severity === 'critical').length;
    const highVulns = vulnerabilities.filter((v) => v.severity === 'high').length;
    const mediumVulns = vulnerabilities.filter((v) => v.severity === 'medium').length;

    overallScore -= criticalVulns * 20;
    overallScore -= highVulns * 10;
    overallScore -= mediumVulns * 5;
    overallScore -= codeHealthIssues.length * 2;

    overallScore = Math.max(0, overallScore);

    const summary = this._generateSummary(vulnerabilities, codeHealthIssues, overallScore);

    return {
      timestamp: new Date().toISOString(),
      filesAnalyzed: filesArray.length,
      securityVulnerabilities: vulnerabilities,
      codeHealthIssues,
      overallScore,
      summary,
    };
  }

  /**
   * Detect common issues in file content
   */
  private _detectIssues(filePath: string, content: string) {
    const vulnerabilities: SecurityVulnerability[] = [];
    const healthIssues: CodeHealthIssue[] = [];
    const lines = content.split('\n');

    /*
     * Check for hardcoded secrets - use function to create fresh regex each time
     * to avoid lastIndex issues with global regexes
     */
    const secretPatternDefs = [
      {
        pattern: 'password\\s*=\\s*[\'"][^\'"]+[\'"]',
        severity: 'critical' as const,
        category: 'Hardcoded Credentials',
      },
      { pattern: 'api[_-]?key\\s*=\\s*[\'"][^\'"]+[\'"]', severity: 'high' as const, category: 'API Key Exposure' },
      { pattern: 'secret\\s*=\\s*[\'"][^\'"]+[\'"]', severity: 'high' as const, category: 'Secret Exposure' },
      { pattern: 'token\\s*=\\s*[\'"][^\'"]+[\'"]', severity: 'high' as const, category: 'Token Exposure' },
      { pattern: 'aws[_-]?access[_-]?key', severity: 'critical' as const, category: 'AWS Credentials' },
      { pattern: 'sk-[a-zA-Z0-9]{20,}', severity: 'critical' as const, category: 'OpenAI Key' },
    ];

    // Check for common security issues - use function to create fresh regex each time
    const securityPatternDefs = [
      {
        pattern: 'eval\\s*\\(',
        severity: 'high' as const,
        category: 'Code Injection',
        suggestion: 'Avoid using eval()',
      },
      {
        pattern: 'innerHTML\\s*=',
        severity: 'medium' as const,
        category: 'XSS Vulnerability',
        suggestion: 'Use textContent instead',
      },
      {
        pattern: 'dangerouslySetInnerHTML',
        severity: 'medium' as const,
        category: 'XSS Risk',
        suggestion: 'Sanitize content before using',
      },
      {
        pattern: 'process\\.env\\.NODE_ENV\\s*===\s*[\'"]development[\'"]',
        severity: 'low' as const,
        category: 'Debug Code',
      },
      {
        pattern: 'console\\.log\\s*\\(',
        severity: 'low' as const,
        category: 'Debug Statement',
        suggestion: 'Remove console.log in production',
      },
      {
        pattern: 'TODO|FIXME|XXX|HACK',
        severity: 'low' as const,
        category: 'Technical Debt',
        suggestion: 'Address TODO items',
      },
      {
        pattern: 'catch\\s*\\(\\s*\\)\\s*{}',
        severity: 'medium' as const,
        category: 'Empty Catch Block',
        suggestion: 'Handle errors properly',
      },
      {
        pattern: 'setTimeout\\s*\\(\\s*[\'"]',
        severity: 'medium' as const,
        category: 'String setTimeout',
        suggestion: 'Use function reference',
      },
    ];

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for secrets - create fresh regex for each line to avoid lastIndex issues
      for (const def of secretPatternDefs) {
        const regex = new RegExp(def.pattern, 'i');

        if (regex.test(line)) {
          vulnerabilities.push({
            severity: def.severity,
            category: def.category,
            file: filePath,
            line: lineNum,
            description: `Potential ${def.category} found`,
            recommendation: 'Move sensitive data to environment variables',
          });
        }
      }

      // Check for security issues - create fresh regex for each line to avoid lastIndex issues
      for (const def of securityPatternDefs) {
        const regex = new RegExp(def.pattern);

        if (regex.test(line)) {
          healthIssues.push({
            type: def.severity === 'high' ? 'security' : def.severity === 'medium' ? 'bug' : 'best-practice',
            file: filePath,
            line: lineNum,
            message: `Potential ${def.category}`,
            suggestion: def.suggestion,
          });
        }
      }
    });

    // Check for missing error handling
    if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
      if (content.includes('fetch(') && !content.includes('catch')) {
        healthIssues.push({
          type: 'bug',
          file: filePath,
          message: 'fetch() without error handling',
          suggestion: 'Add .catch() or try/catch for error handling',
        });
      }
    }

    return { vulnerabilities, healthIssues };
  }

  /**
   * Generate summary of analysis results
   */
  private _generateSummary(
    vulnerabilities: SecurityVulnerability[],
    healthIssues: CodeHealthIssue[],
    score: number,
  ): string {
    const critical = vulnerabilities.filter((v) => v.severity === 'critical').length;
    const high = vulnerabilities.filter((v) => v.severity === 'high').length;
    const medium = vulnerabilities.filter((v) => v.severity === 'medium').length;
    const low = vulnerabilities.filter((v) => v.severity === 'low').length;

    let summary = `Code health score: ${score}/100. `;

    if (critical > 0 || high > 0) {
      summary += `Found ${critical} critical and ${high} high severity security issues. `;
    }

    if (medium > 0 || low > 0) {
      summary += `${medium} medium and ${low} low severity issues found. `;
    }

    if (healthIssues.length > 0) {
      summary += `${healthIssues.length} code quality improvements recommended.`;
    }

    if (score >= 90) {
      summary += ' Code quality is excellent!';
    } else if (score >= 70) {
      summary += ' Code quality is good but could be improved.';
    } else if (score >= 50) {
      summary += ' Code quality needs attention.';
    } else {
      summary += ' Critical security issues must be addressed immediately.';
    }

    return summary;
  }

  /**
   * Generate AI-powered documentation for a file
   */
  async generateDocumentation(
    filePath: string,
    content: string,
    options: DocGenerationOptions = { format: 'markdown' },
  ): Promise<GeneratedDocumentation> {
    if (!this._model) {
      throw new Error('AI model not configured');
    }

    const { format, includeExamples = true, includeTypeInfo = true } = options;
    const fileExtension = filePath.split('.').pop() || '';

    let prompt = `Generate ${format === 'markdown' ? 'Markdown' : format === 'jsdoc' ? 'JSDoc' : 'HTML'} documentation for the following code file: ${filePath}\n\n`;

    if (includeExamples) {
      prompt += 'Include practical usage examples where appropriate.\n';
    }

    if (includeTypeInfo) {
      prompt += 'Include type information and parameter descriptions.\n';
    }

    prompt += `\n\`\`\`${this._getLanguageFromExtension(fileExtension)}\n${content.substring(0, 8000)}\n\`\`\``;

    const result = await generateText({
      model: this._model,
      prompt,
      maxTokens: 4000,
    });

    return {
      file: filePath,
      content: result.text,
      language: this._getLanguageFromExtension(fileExtension),
    };
  }

  /**
   * Generate README for a project
   */
  async generateProjectReadme(
    files: Record<string, { content: string; path: string }>,
    projectName: string,
  ): Promise<string> {
    if (!this._model) {
      throw new Error('AI model not configured');
    }

    const fileList = Object.keys(files).slice(0, 50).join('\n- ');
    const packageJson = files['package.json']?.content ? JSON.parse(files['package.json'].content) : null;

    const prompt = `Generate a comprehensive README.md for a project called "${projectName}". 

Project structure:
- ${fileList}

${
  packageJson
    ? `
Project metadata:
- Name: ${packageJson.name}
- Description: ${packageJson.description || 'N/A'}
- Version: ${packageJson.version || 'N/A'}
- Main entry: ${packageJson.main || 'N/A'}
- Scripts: ${Object.keys(packageJson.scripts || {}).join(', ')}
- Dependencies: ${Object.keys(packageJson.dependencies || {})
        .slice(0, 10)
        .join(', ')}
`
    : ''
}

Generate a professional README with:
1. Project title and description
2. Installation instructions
3. Usage examples
4. Available scripts/commands
5. Technology stack
6. Contributing guidelines
7. License (if mentioned in files)

Format as clean Markdown.`;

    const result = await generateText({
      model: this._model,
      prompt,
      maxTokens: 3000,
    });

    return result.text;
  }

  /**
   * Get language from file extension
   */
  private _getLanguageFromExtension(extension: string): string {
    const languageMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      rb: 'ruby',
      java: 'java',
      go: 'go',
      rs: 'rust',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      html: 'html',
      css: 'css',
      scss: 'scss',
      less: 'less',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      md: 'markdown',
      sql: 'sql',
      sh: 'bash',
      bash: 'bash',
      dockerfile: 'dockerfile',
    };
    return languageMap[extension.toLowerCase()] || 'text';
  }
}

export const analysisService = new AnalysisServiceClass();
