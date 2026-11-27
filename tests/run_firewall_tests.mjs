import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxmonitor-fw-tests-'));

try {
  const tscBin = path.join(repoRoot, 'node_modules', '.bin', 'tsc');
  execFileSync(
    tscBin,
    [
      '--module',
      'commonjs',
      '--moduleResolution',
      'node',
      '--target',
      'ES2022',
      '--esModuleInterop',
      '--strict',
      '--skipLibCheck',
      '--outDir',
      tmpDir,
      path.join(repoRoot, 'src', 'lib', 'auth.ts'),
      path.join(repoRoot, 'src', 'lib', 'config.ts'),
      path.join(repoRoot, 'src', 'lib', 'types.ts'),
      path.join(repoRoot, 'src', 'lib', 'firewall.ts'),
      path.join(repoRoot, 'src', 'lib', 'firewall-server.ts'),
      path.join(repoRoot, 'tests', 'firewall_domain_test.ts'),
      path.join(repoRoot, 'tests', 'firewall_api_test.ts'),
    ],
    { stdio: 'inherit', cwd: repoRoot }
  );

  execFileSync(
    process.execPath,
    [
      '--test',
      path.join(tmpDir, 'tests', 'firewall_domain_test.js'),
      path.join(tmpDir, 'tests', 'firewall_api_test.js'),
    ],
    {
      stdio: 'inherit',
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_PATH: path.join(repoRoot, 'node_modules'),
      },
    }
  );

  let pythonBin = 'python3';
  if (process.platform === 'darwin' && fs.existsSync('/usr/bin/python3')) {
    try {
      execFileSync('/usr/bin/python3', ['-I', '-c', 'import unittest'], { stdio: 'ignore' });
      pythonBin = '/usr/bin/python3';
    } catch {
      pythonBin = 'python3';
    }
  }

  const pythonTests = ['firewall_helper_tests.py'];
  if (fs.existsSync(path.join(repoRoot, 'tests', 'firewall_locale_test.py'))) {
    pythonTests.push('firewall_locale_test.py');
  }

  for (const pattern of pythonTests) {
    execFileSync(
      pythonBin,
      ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-p', pattern, '-v'],
      { stdio: 'inherit', cwd: repoRoot }
    );
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
