export interface UserConfig {
  username: string;
  password?: string;
}

export interface AIConfig {
  url: string;
  key: string;
  model: string;
}

export interface FeaturesConfig {
  monitor?: boolean;
  processes?: boolean;
  ports?: boolean;
  firewall?: boolean;
  logs?: boolean;
  configs?: boolean;
  launchagent?: boolean;
  docker?: boolean;
  nginx?: boolean;
  [key: string]: boolean | undefined;
}

export interface DeployConfig {
  path: string;
  port: number;
}

export interface QuickCommand {
  label: string;
  labelKey?: string;
  cmd: string;
}

export interface AppConfig {
  users: UserConfig[];
  jwtSecret?: string;
  ai: Partial<AIConfig>;
  features: FeaturesConfig;
  deploy?: DeployConfig;
  version?: string;
  customConfigs?: string[];
  customLogs?: string[];
  terminalQuickCommands?: QuickCommand[];
}
