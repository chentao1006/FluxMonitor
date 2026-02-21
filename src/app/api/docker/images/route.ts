import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const { stdout: imagesOutput } = await execAsync('docker images --format \'{{json .}}\'');
    const images = imagesOutput
      .split('\n')
      .filter((line: string) => line.trim())
      .map((line: string) => JSON.parse(line));

    let usedImages = new Set<string>();
    try {
      const { stdout: containersOutput } = await execAsync("docker ps -a --format '{{.Image}}'");
      usedImages = new Set(containersOutput.split('\n').map(l => l.trim()).filter(Boolean));
    } catch {
      // Ignore
    }

    const enhancedImages = images.map((img: Record<string, string>) => {
      const imgName = `${img.Repository}:${img.Tag}`;
      const imgID = img.ID;
      const inUse = usedImages.has(imgName) || usedImages.has(img.Repository) || usedImages.has(imgID) || Array.from(usedImages).some(u => u.startsWith(imgID));
      return {
        ...img,
        InUse: inUse
      };
    });

    return NextResponse.json({
      success: true,
      data: enhancedImages,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({
      error: '获取镜像列表失败',
      details: err?.message || '未知错误'
    }, { status: 500 });
  }
}
