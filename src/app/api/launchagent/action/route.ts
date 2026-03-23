import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { runCommandWithSudo } from '@/lib/exec';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { action, filePath, content, newFilePath, sudoPassword } = await request.json();

    if (!action || !filePath) {
      return NextResponse.json({ error: 'MISSING_PARAMS' }, { status: 400 });
    }

    if (action === 'read') {
      const data = await fs.readFile(filePath, 'utf-8');
      return NextResponse.json({ success: true, data });
    }

    if (action === 'write') {
      await fs.writeFile(filePath, content, 'utf-8');
      return NextResponse.json({ success: true });
    }

    if (action === 'load') {
      try {
        await execAsync(`launchctl load -w "${filePath}"`);
      } catch (error: any) {
        if (error.stderr?.includes('Permission denied') || error.stderr?.includes('privileged')) {
          await runCommandWithSudo(`launchctl load -w "${filePath}"`, sudoPassword);
        } else throw error;
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'unload') {
      try {
        await execAsync(`launchctl unload -w "${filePath}"`);
      } catch (error: any) {
        if (error.stderr?.includes('Permission denied') || error.stderr?.includes('privileged')) {
          await runCommandWithSudo(`launchctl unload -w "${filePath}"`, sudoPassword);
        } else throw error;
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'reload') {
      try { await execAsync(`launchctl unload -w "${filePath}"`); } catch (e) { } // ignore unload error if not loaded
      await execAsync(`launchctl load -w "${filePath}"`);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      try { await execAsync(`launchctl unload -w "${filePath}"`); } catch (e) { } // ignore unload error
      await fs.unlink(filePath);
      return NextResponse.json({ success: true });
    }

    if (action === 'rename') {
      if (!newFilePath) return NextResponse.json({ error: 'MISSING_NEW_PATH' }, { status: 400 });
      try { await execAsync(`launchctl unload -w "${filePath}"`); } catch (e) { }
      await fs.rename(filePath, newFilePath);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
  } catch (error: any) {
    if (error.code === 'SUDO_REQUIRED') {
      return NextResponse.json({ error: 'SUDO_REQUIRED' }, { status: 403 });
    }
    if (error.stderr?.toLowerCase().includes('password')) {
      return NextResponse.json({ error: 'SUDO_PASSWORD_INCORRECT' }, { status: 403 });
    }
    console.error('LaunchAgent Action Error:', error);
    return NextResponse.json({
      success: false,
      error: 'LAUNCHAGENT_ACTION_FAILED',
      details: error?.stderr || error?.message || 'UNKNOWN_ERROR'
    }, { status: 500 });
  }
}
