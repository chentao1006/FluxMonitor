import { NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/config';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const config = getConfig();
    
    let version = '';
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        version = pkg.version;
      }
    } catch (e) {
      console.error('Error reading package.json version:', e);
    }
    
    // Don't leak the JWT secret to the frontend settings page
    const { jwtSecret, ...safeConfig } = config;
    return NextResponse.json({ 
      success: true, 
      data: {
        ...safeConfig,
        version
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'FETCH_SETTINGS_FAILED' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const currentConfig = getConfig();

    // Merge or update specific fields
    const newConfig = {
      ...currentConfig,
      ...body,
      // Ensure we don't overwrite jwtSecret if it's not provided
      jwtSecret: body.jwtSecret || currentConfig.jwtSecret,
    };

    saveConfig(newConfig);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'SAVE_SETTINGS_FAILED' }, { status: 500 });
  }
}
