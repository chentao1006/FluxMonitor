import fs from 'fs';
import path from 'path';
import { AppConfig } from './types';

function getConfigPath() {
  return process.env.CONFIG_PATH || path.join(process.cwd(), 'config.json');
}

export function getConfig(): AppConfig {
  const configPath = getConfigPath();
  try {
    if (!fs.existsSync(configPath)) {
      console.warn(`Config file not found at ${configPath}, returning empty object`);
      return { users: [], ai: {}, features: {} } as AppConfig;
    }
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);

    // auto fill features from config.example.json if features is empty
    if (!config.features || Object.keys(config.features).length === 0) {
      const examplePath = path.join(process.cwd(), 'config.example.json');
      if (fs.existsSync(examplePath)) {
        try {
          const exampleContent = fs.readFileSync(examplePath, 'utf8');
          const exampleConfig = JSON.parse(exampleContent);
          if (exampleConfig.features) {
            config.features = { ...exampleConfig.features };
          }
        } catch (e) {
          console.warn('read config.example.json failed to fill features:', e);
        }
      }
    }
    return config as AppConfig;
  } catch (error) {
    console.error(`Error reading config at ${configPath}:`, error);
    return { users: [], ai: {}, features: {} } as AppConfig;
  }
}

export function saveConfig(config: AppConfig) {
  const configPath = getConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing config at ${configPath}:`, error);
    return false;
  }
}
