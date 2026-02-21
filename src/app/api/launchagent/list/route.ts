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
    const { stdout } = await execAsync('launchctl list');
    const loadedList = stdout.split('\n');

    const enrichedPlists = plists.map(p => {
      // Very naive check: usually the plist file name w/o extension is the label
      const label = p.name.replace('.plist', '');
      const isLoaded = loadedList.some(l => l.includes(label));
      return { ...p, isLoaded };
    });

    return NextResponse.json({ success: true, data: enrichedPlists });
  } catch (error: any) {
    return NextResponse.json({ error: '无法获取 LaunchAgents 列表', details: error?.message }, { status: 500 });
  }
}
