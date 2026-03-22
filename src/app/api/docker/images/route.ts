import { NextResponse } from 'next/server';
import { execAsync } from '@/lib/exec';

export async function GET() {
  try {
    const { stdout: imagesOutput } = await execAsync('docker images --format \'{{json .}}\'', { maxBuffer: 100 * 1024 * 1024 });
    const images = imagesOutput
      .split('\n')
      .filter((line: string) => line.trim())
      .map((line: string) => JSON.parse(line));

    let usedImages = new Set<string>();
    try {
      const { stdout: containersOutput } = await execAsync("docker ps -a --format '{{.Image}}'", { maxBuffer: 100 * 1024 * 1024 });
      usedImages = new Set(containersOutput.split('\n').map(l => l.trim()).filter(Boolean));
    } catch {
      // Ignore
    }

    // Group images by ID to avoid duplicates (same image with multiple tags)
    const groupedImages: Record<string, any> = {};

    images.forEach((img: any) => {
      const id = img.ID;
      if (!groupedImages[id]) {
        const inUse = usedImages.has(img.Repository + ':' + img.Tag) ||
          usedImages.has(img.Repository) ||
          usedImages.has(id) ||
          Array.from(usedImages).some(u => u.startsWith(id));

        groupedImages[id] = {
          ...img,
          Tags: [img.Tag],
          Repositories: [img.Repository],
          InUse: inUse
        };
      } else {
        if (!groupedImages[id].Tags.includes(img.Tag)) {
          groupedImages[id].Tags.push(img.Tag);
        }
        if (!groupedImages[id].Repositories.includes(img.Repository)) {
          groupedImages[id].Repositories.push(img.Repository);
        }
      }
    });

    const finalImages = Object.values(groupedImages).map(img => ({
      ...img,
      Tag: img.Tags.join(', '),
      Repository: img.Repositories.join(', ')
    }));

    return NextResponse.json({
      success: true,
      data: finalImages,
    });
  } catch (error: any) {
    const message = error?.message || '';
    if (message.includes('command not found')) {
      return NextResponse.json({
        error: 'DOCKER_NOT_FOUND',
        details: 'Docker is not installed or not in the PATH.'
      }, { status: 500 });
    }
    return NextResponse.json({
      error: 'FETCH_FAILED',
      details: message
    }, { status: 500 });
  }
}
