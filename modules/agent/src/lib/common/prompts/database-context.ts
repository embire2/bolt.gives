export interface ProjectDatabasePromptContext {
  isConnected: boolean;
  provider?: 'supabase' | 'postgresql';
}

export interface LegacySupabasePromptContext {
  isConnected: boolean;
  hasSelectedProject: boolean;
}

export function getProjectDatabasePromptContext(
  database?: ProjectDatabasePromptContext,
  supabase?: LegacySupabasePromptContext,
) {
  if (database?.isConnected && database.provider === 'postgresql') {
    return `A user-owned PostgreSQL database is connected to this project. The hosted runtime injects DATABASE_URL and standard PG* variables into commands and Preview processes. Read process.env.DATABASE_URL on the server. Never write, print, return, or guess the connection string, and never put it in source files or .env files.`;
  }

  if (
    (database?.isConnected && database.provider === 'supabase') ||
    (supabase?.isConnected && supabase.hasSelectedProject)
  ) {
    return `A Supabase project is connected. The hosted runtime injects VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL, and SUPABASE_ANON_KEY. Read those variables at runtime or build time. Never copy their values into generated source or .env files.`;
  }

  return `No project database is connected. Projects do not require a database. If the requested feature genuinely needs persistence, ask the user to open Database and connect Supabase or PostgreSQL; do not block unrelated work and do not invent credentials.`;
}
