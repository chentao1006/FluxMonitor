import { NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/config';

export async function GET() {
  try {
    const config = getConfig();
    // Don't leak the JWT secret to the frontend settings page
    const { jwtSecret, ...safeConfig } = config;
    return NextResponse.json({ success: true, data: safeConfig });
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
