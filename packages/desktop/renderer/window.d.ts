export {};

declare global {
  interface Window {
    genie: {
      setInteractive: (value: boolean) => void;
      setHitRegions: (regions: Array<{ x: number; y: number; width: number; height: number }>) => void;
      getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
      quitApp: () => void;
      getFilePath: (file: File) => string;
      scanProject: (projectPath: string) => Promise<unknown>;
      scanZip: (zipPath: string) => Promise<unknown>;
      getInjectText: (projectPath: string) => Promise<string>;
      createCapsule: (projectPath: string) => Promise<unknown>;
      askGenie: (question: string) => Promise<string>;
      openFolder: () => Promise<string | null>;
      onScanProgress: (callback: (data: unknown) => void) => () => void;
      onScanDone: (callback: (data: unknown) => void) => () => void;
      onScanError: (callback: (data: unknown) => void) => () => void;
    };
  }
}
