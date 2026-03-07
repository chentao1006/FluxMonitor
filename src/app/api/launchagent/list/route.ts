import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const homeDir = process.env.HOME || '/Users/chentao';
    const agentsDir = path.join(homeDir, 'Library', 'LaunchAgents');

    // Fallback if no user dir exists
    if (!await fs.stat(agentsDir).catch(() => false)) {
      return NextResponse.json({ success: true, data: [] });
    }

    const files = await fs.readdir(agentsDir);
    const plists = files.filter(f => f.endsWith('.plist')).map(f => ({
      name: f,
      path: path.join(agentsDir, f)
    }));

    // Get loaded services
    const { stdout } = await execAsync('launchctl list', { maxBuffer: 100 * 1024 * 1024 });
    const loadedList = stdout.split('\n');

    const enrichedPlists = await Promise.all(plists.map(async p => {
      try {
        // Use plutil to get the real Label from the plist file
        const { stdout: label } = await execAsync(`plutil -extract Label raw "${p.path}"`);
        const cleanLabel = label.trim();
        const isLoaded = loadedList.some(l => l.includes(cleanLabel));
        return { ...p, isLoaded, label: cleanLabel };
      } catch (e) {
        // Fallback to filename if plutil fails
        const label = p.name.replace('.plist', '');
        const isLoaded = loadedList.some(l => l.includes(label));
        return { ...p, isLoaded, label };
      }
    }));

    return NextResponse.json({ success: true, data: enrichedPlists });
  } catch (error: any) {
    return NextResponse.json({ error: 'FETCH_FAILED', details: error?.message }, { status: 500 });
  }
}
