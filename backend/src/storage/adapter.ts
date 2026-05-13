export interface StorageAdapter {
  saveApk(runId: string, content: Buffer): Promise<string>;
  saveTrace(runId: string, content: unknown): Promise<string>;
}
