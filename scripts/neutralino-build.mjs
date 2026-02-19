#!/usr/bin/env node

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

// Neutralino build script
async function buildNeutralino() {
  console.log('Building Neutralino app...');

  try {
    // Copy Neutralino binary and configuration to dist-neutralino
    const neutralinoDistDir = path.join(process.cwd(), 'dist-neutralino');
    
    if (!fs.existsSync(neutralinoDistDir)) {
      fs.mkdirSync(neutralinoDistDir, { recursive: true });
    }

    // Copy build client to dist-neutralino
    const buildClientDir = path.join(process.cwd(), 'build', 'client');
    
    if (!fs.existsSync(buildClientDir)) {
      console.error('Build client directory not found. Run "pnpm build" first.');
      process.exit(1);
    }

    // Copy the entire build client directory
    await execAsync(`cp -r ${buildClientDir}/* ${neutralinoDistDir}/`);

    // Create a simple index.html for Neutralino if needed
    if (!fs.existsSync(path.join(neutralinoDistDir, 'index.html'))) {
      const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>bolt.gives</title>
</head>
<body>
  <div id="app"></div>
  <script src="index.js"></script>
</body>
</html>`;
      fs.writeFileSync(path.join(neutralinoDistDir, 'index.html'), indexHtml);
    }

    console.log('Neutralino build completed successfully!');
    console.log(`Output directory: ${neutralinoDistDir}`);
    
  } catch (error) {
    console.error('Error building Neutralino app:', error);
    process.exit(1);
  }
}

buildNeutralino();