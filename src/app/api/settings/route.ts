import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'config.json');

function getConfig() {
  const content = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(content);
}

function saveConfig(config: any) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

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
