import { execSync } from 'child_process';
try {
  const out = execSync('npx tsc --noEmit', { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' });
  console.log('Success:', out);
} catch(e) {
  console.log(e.stdout || e.message);
  if (e.stderr) console.log('Stderr:', e.stderr);
}
