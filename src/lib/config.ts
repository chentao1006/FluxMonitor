import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'config.json');

export function getConfig() {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading config.json:', error);
    return {};
  }
}

export function saveConfig(config: any) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing config.json:', error);
    return false;
  }
}
