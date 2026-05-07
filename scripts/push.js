import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Automated Versioning & Deployment Script
 * 
 * Usage: node scripts/push.js "Your commit message"
 */

const projectRoot = process.cwd();
const pkgPath = join(projectRoot, 'package.json');

function run(command) {
  try {
    console.log(`> ${command}`);
    return execSync(command, { stdio: 'inherit' });
  } catch (err) {
    console.error(`Error executing: ${command}`);
    process.exit(1);
  }
}

// 1. Get commit message
const commitMsg = process.argv[2] || 'Version bump and automated push';

console.log('--- Starting Automated Release ---');

// 2. Bump Version
console.log('Bumping version...');
run('npm version patch --no-git-tag-version');

// 3. Read new version for logging
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const newVersion = pkg.version;
console.log(`New version: ${newVersion}`);

// 4. Git Operations
console.log('Staging changes...');
run('git add .');

console.log(`Committing with message: "${commitMsg}"`);
// Using double quotes for message to handle potential spaces/special chars on Windows
run(`git commit -m "${commitMsg}"`);

console.log('Pushing to GitHub...');
run('git push origin main');

// 5. Deployment
console.log('Deploying to Firebase...');
run('npm run deploy');

console.log('--- Release Complete ---');
console.log(`Version ${newVersion} is now live!`);
