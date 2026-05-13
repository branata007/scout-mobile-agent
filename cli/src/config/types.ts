export interface ScoutConfig {
  project: {
    id: string;
    name: string;
    appPackage: string;
  };
  backend: {
    url: string;
    apiKey: string;
  };
  cwd: string;
}
