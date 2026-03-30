const { execSync } = require('child_process');

/**
 * Retrieves the current git hash with a clean fallback.
 */
const getGitHash = () => {
  try {
    // stdio: 'pipe' ensures no git errors clutter the UI
    return execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
  } catch {
    return 'no-git-info';
  }
};

const version = process.env.npm_package_version || '0.0.0';
const hash = getGitHash();

// ANSI Escape Codes for Styling
const cyan = '\x1b[36m';
const yellow = '\x1b[33m';
const bold = '\x1b[1m';
const reset = '\x1b[0m';

const border = `${cyan}★━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━★${reset}`;
const title = `${bold}B O L T . G I V E S${reset}`.padStart(30).padEnd(46);

console.log(`
${border}
║${title}║
         🤖⚡️  Welcome  ⚡️🤖
${border}
${yellow}📍 Version Tag:${reset}    v${version}
${yellow}📍 Commit Hash:${reset}    ${hash}

  Please wait until the URL appears here...
${border}
`);
