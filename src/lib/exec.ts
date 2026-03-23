import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsyncPipe = promisify(exec);

// Dynamically augment PATH with likely Node.js global bin paths (NVM, etc.)
let dynamicPaths = '';
try {
  const nvmVersionsDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
  if (fs.existsSync(nvmVersionsDir)) {
    const dirs = fs.readdirSync(nvmVersionsDir).filter(d => d.startsWith('v')).sort().reverse();
    dynamicPaths = dirs.map(d => path.join(nvmVersionsDir, d, 'bin')).join(':');
  }

  // Also include bun, fnm, and common others just in case
  const extraPaths = [
    path.join(os.homedir(), '.fnm', 'current', 'bin'),
    path.join(os.homedir(), '.bun', 'bin'),
    path.join(os.homedir(), '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ].filter(p => fs.existsSync(p)).join(':');

  if (extraPaths) {
    dynamicPaths = dynamicPaths ? `${dynamicPaths}:${extraPaths}` : extraPaths;
  }
} catch {
  // Ignore
}

const COMMON_PATH = `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin${dynamicPaths ? ':' + dynamicPaths : ''}`;

export const EXEC_ENV = {
  ...process.env,
  PATH: `${COMMON_PATH}:${process.env.PATH || ''}`
};

export async function execAsync(command: string, options: Record<string, any> = {}): Promise<{ stdout: string; stderr: string }> {
  return execAsyncPipe(command, {
    encoding: 'utf8',
    ...options,
    env: { ...EXEC_ENV, ...(options.env || {}) }
  }) as unknown as Promise<{ stdout: string; stderr: string }>;
}

export async function runCommandWithSudo(command: string, password?: string) {
  if (!password) {
    const error = new Error('SUDO_REQUIRED');
    (error as any).code = 'SUDO_REQUIRED';
    throw error;
  }

  // Use sudo -S to read password from stdin
  const escapedPassword = password.replace(/"/g, '\\"').replace(/\$/g, '\\$');
  const sudoCommand = `echo "${escapedPassword}" | sudo -S -p '' ${command}`;
  return execAsync(sudoCommand);
}

export async function writeFileWithSudo(filePath: string, content: string, password?: string) {
  const tempPath = path.join(os.tmpdir(), `flux_config_${Math.random().toString(36).substring(7)}`);
  await fs.promises.writeFile(tempPath, content, 'utf-8');

  try {
    await runCommandWithSudo(`mv "${tempPath}" "${filePath}"`, password);
  } catch (error: any) {
    if (fs.existsSync(tempPath)) {
      try { await fs.promises.unlink(tempPath); } catch { }
    }
    throw error;
  }
}
