export interface GeneratedImage {
  id: string;
  url: string; // Base64 data URL
  prompt: string;
  basePrompt: string; // The scene prompt without DNA
  timestamp: number;
}

export interface CharacterDNA {
  physicalDescription: string;
  artStyle: string;
}

export interface AnalysisResponse {
  dna: string;
  style: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  GENERATING = 'GENERATING',
  EDITING = 'EDITING',
}

export interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  timestamp: string;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}