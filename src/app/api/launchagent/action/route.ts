import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { action, filePath, content, newFilePath } = await request.json();

    if (!action || !filePath) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
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
      await execAsync(`launchctl load -w "${filePath}"`);
      return NextResponse.json({ success: true });
    }

    if (action === 'unload') {
      await execAsync(`launchctl unload -w "${filePath}"`);
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
      if (!newFilePath) return NextResponse.json({ error: '缺少新文件名' }, { status: 400 });
      try { await execAsync(`launchctl unload -w "${filePath}"`); } catch (e) { }
      await fs.rename(filePath, newFilePath);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '无效的操作' }, { status: 400 });
  } catch (error: any) {
    console.error('LaunchAgent Action Error:', error);
    return NextResponse.json({
      success: false,
      error: 'LaunchAgent 操作失败',
      details: error?.stderr || error?.message || '未知错误'
    }, { status: 500 });
  }
}
