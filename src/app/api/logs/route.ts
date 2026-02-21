import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('file');

  if (filePath) {
    // Read specific file content
    try {
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        return NextResponse.json({ success: false, error: '文件不存在' }, { status: 404 });
      }

      // Get last 2000 lines
      const { stdout } = await execAsync(`tail -n 2000 "${filePath}"`);
      return NextResponse.json({ success: true, data: stdout });
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  // List log files
  try {
    const homeDir = os.homedir();
    const appsDir = path.join(homeDir, 'Applications');

    // Check if Applications exists
    try {
      await fs.access(appsDir);
    } catch {
      return NextResponse.json({ success: true, data: [] });
    }

    // Find all .log and nohup.out files in ~/Applications, up to 5 levels deep to avoid scanning too much
    // Sorting by modification time (most recent first)
    const { stdout } = await execAsync(`find "${appsDir}" -maxdepth 5 \\( -name "*.log" -o -name "nohup.out" \\) -type f -exec stat -f "%m %z %N" {} + | sort -rn | head -n 50`);

    const files = stdout.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split(' ');
      const mtime = parts[0];
      const size = parts[1];
      const fullPath = parts.slice(2).join(' ');
      return {
        path: fullPath,
        name: path.basename(fullPath),
        size: parseInt(size),
        mtime: parseInt(mtime) * 1000, // to ms
      };
    });

    return NextResponse.json({ success: true, data: files });
  } catch (error: any) {
    console.error('Logs API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { file, action } = await request.json();
    if (!file) {
      return NextResponse.json({ success: false, error: '未指定文件' }, { status: 400 });
    }

    if (action === 'clear') {
      await fs.writeFile(file, '');
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      await fs.unlink(file);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: '无效的操作' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
