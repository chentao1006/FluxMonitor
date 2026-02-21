import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export async function POST() {
  const tmpPath = path.join(os.tmpdir(), `screenshot_${Date.now()}.png`);

  try {
    // -x: silent
    // -t png: png format
    await execAsync(`screencapture -x -t png "${tmpPath}"`);

    const imageBuffer = await fs.readFile(tmpPath);
    const base64Image = imageBuffer.toString('base64');

    // Clean up
    await fs.unlink(tmpPath);

    return NextResponse.json({
      success: true,
      data: `data:image/png;base64,${base64Image}`
    });
  } catch (error: any) {
    console.error('Screenshot error:', error);
    return NextResponse.json({
      success: false,
      error: '无法获取屏幕截图',
      details: error.message
    }, { status: 500 });
  }
}
