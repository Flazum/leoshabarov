export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Quad {
  p1: Point; // Top-Left
  p2: Point; // Top-Right
  p3: Point; // Bottom-Right
  p4: Point; // Bottom-Left
}

export enum Mode {
  TRANSFORM = 'transform',
  CORNER = 'corner',
}

export enum AnimationDirection {
  IN = 'in',
  OUT = 'out',
  STOP = 'stop',
}

export interface AppState {
  imageSrc: string | null;
  imageDimensions: { width: number; height: number };
  quad: Quad; // Normalized 0-1 coordinates relative to image
  mode: Mode;
  depth: number;
  zoomSpeed: number;
  direction: AnimationDirection; // Current playback state
  desiredDirection: AnimationDirection; // IN or OUT
  isExporting: boolean;
  exportProgress: number;
  constantSpeed: boolean;
  shouldRemoveBackground: boolean;
  isProcessing: boolean;
}

// Global definition for GIF.js which is loaded via script tag
declare global {
  interface Window {
    GIF: any;
  }
}