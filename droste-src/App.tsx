import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Mode, AnimationDirection, Quad, AppState } from './types';
import DrosteCanvas from './components/DrosteCanvas';
import {
  Upload,
  Play,
  Pause,
  Download,
  Maximize,
  FastForward,
  Gauge,
  Wand2,
  Loader2,
  FileUp,
  MousePointer2
} from 'lucide-react';
import { removeBackground } from '@imgly/background-removal';

const INITIAL_QUAD: Quad = {
  p1: { x: 0.25, y: 0.25 },
  p2: { x: 0.75, y: 0.25 },
  p3: { x: 0.75, y: 0.75 },
  p4: { x: 0.25, y: 0.75 },
};

const frostPanel =
  'bg-white/70 backdrop-blur-md border border-slate-200/70 shadow-[0_10px_30px_rgba(15,23,42,0.08)]';
const frostPanelStrong =
  'bg-white/78 backdrop-blur-md border border-slate-200/80 shadow-[0_16px_45px_rgba(15,23,42,0.10)]';

const candyBtn =
  'bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-white shadow-[0_12px_30px_rgba(236,72,153,0.22)] hover:brightness-105 active:brightness-95';
const candyBtnSoft =
  'bg-white/75 text-slate-900 border border-slate-200/80 hover:bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]';

export default function App() {
  const [state, setState] = useState<AppState>({
    imageSrc: null,
    imageDimensions: { width: 0, height: 0 },
    quad: INITIAL_QUAD,
    mode: Mode.TRANSFORM,
    depth: 10,
    zoomSpeed: 1.0,
    direction: AnimationDirection.STOP,
    desiredDirection: AnimationDirection.IN,
    isExporting: false,
    exportProgress: 0,
    constantSpeed: false,
    shouldRemoveBackground: false,
    isProcessing: false,
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const loadImage = useCallback((src: string) => {
    const img = new Image();
    img.onload = () => {
      setState(prev => ({
        ...prev,
        imageSrc: src,
        imageDimensions: { width: img.width, height: img.height },
        quad: INITIAL_QUAD,
        direction: AnimationDirection.STOP,
        isProcessing: false
      }));
    };
    img.onerror = () => {
      setState(prev => ({ ...prev, isProcessing: false }));
      alert('Failed to load image.');
    };
    img.src = src;
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPEG, etc).');
      return;
    }

    if (state.shouldRemoveBackground) {
      setState(prev => ({ ...prev, isProcessing: true }));
      try {
        const blob = await removeBackground(file);
        const url = URL.createObjectURL(blob);
        loadImage(url);
      } catch (err) {
        console.error('Background removal failed:', err);
        alert('Could not remove background. Loading original image instead.');
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) loadImage(e.target.result as string);
        };
        reader.readAsDataURL(file);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) loadImage(e.target.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, [state.shouldRemoveBackground, loadImage]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processFile(file);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processFile]);

  const togglePlay = () => {
    setState(prev => ({
      ...prev,
      direction: prev.direction === AnimationDirection.STOP ? prev.desiredDirection : AnimationDirection.STOP
    }));
  };

  const toggleDirectionPreference = () => {
    setState(prev => {
      const newDir = prev.desiredDirection === AnimationDirection.IN ? AnimationDirection.OUT : AnimationDirection.IN;
      const activeDir = prev.direction !== AnimationDirection.STOP ? newDir : AnimationDirection.STOP;
      return {
        ...prev,
        desiredDirection: newDir,
        direction: activeDir
      };
    });
  };

  const pageBg =
    'radial-gradient(900px 520px at 18% 6%, rgba(255,120,190,0.20), transparent 62%),' +
    'radial-gradient(900px 520px at 82% 2%, rgba(120,190,255,0.20), transparent 62%),' +
    'radial-gradient(900px 620px at 55% 94%, rgba(190,150,255,0.12), transparent 60%),' +
    'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.78))';

  return (
    <div
      className="flex flex-col h-screen w-screen text-slate-900 font-sans overflow-hidden relative"
      style={{ background: pageBg }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-white/40 backdrop-blur-sm border-4 border-fuchsia-300 border-dashed m-4 rounded-2xl flex items-center justify-center pointer-events-none">
          <div className={`${frostPanelStrong} p-8 rounded-3xl flex flex-col items-center animate-bounce`}>
            <FileUp size={48} className="text-fuchsia-500 mb-4" />
            <h2 className="text-2xl font-bold text-slate-900">Drop Image Here</h2>
          </div>
        </div>
      )}

      {/* Processing Overlay */}
      {state.isProcessing && (
        <div className="absolute inset-0 z-50 bg-white/55 backdrop-blur-md flex flex-col items-center justify-center">
          <Loader2 className="animate-spin text-fuchsia-500 mb-4" size={48} />
          <p className="text-xl font-semibold text-slate-900">Processing Image...</p>
          {state.shouldRemoveBackground && (
            <p className="text-sm text-slate-600 mt-2">Removing background (this may take a moment)</p>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className={`h-16 flex items-center px-4 justify-between z-10 shrink-0 ${frostPanel} border-x-0 border-t-0`}>
        <div className="flex items-center gap-4 min-w-[320px]">
          <h1 className="text-lg md:text-xl font-bold text-slate-900 hidden md:block">
            Leo’s <span className="bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 bg-clip-text text-transparent">Droste Thing</span>
          </h1>

          <div className={`flex items-center rounded-xl p-1 ${frostPanel} shadow-none`}>
            <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg transition-colors text-sm font-semibold ${candyBtn}`}>
              <Upload size={16} />
              <span>Upload</span>
              <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} className="hidden" />
            </label>

            <div className="w-px h-6 bg-slate-200 mx-2"></div>

            <button
              onClick={() => setState(s => ({ ...s, shouldRemoveBackground: !s.shouldRemoveBackground }))}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                state.shouldRemoveBackground
                  ? 'bg-gradient-to-r from-fuchsia-500/15 to-sky-500/15 text-slate-900 border border-fuchsia-200/70'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Automatically remove background from uploaded images"
            >
              <Wand2 size={14} className={state.shouldRemoveBackground ? 'text-fuchsia-600' : ''} />
              <span>Remove BG</span>
              <div className={`w-9 h-4 rounded-full relative transition-colors ${state.shouldRemoveBackground ? 'bg-gradient-to-r from-fuchsia-500 to-sky-500' : 'bg-slate-200'}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${state.shouldRemoveBackground ? 'left-5' : 'left-0.5'}`} />
              </div>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Controls Group */}
          <div className={`flex rounded-xl p-1 items-center ${frostPanel}`}>
            <button
              onClick={togglePlay}
              disabled={!state.imageSrc}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
                state.direction !== AnimationDirection.STOP
                  ? 'bg-rose-500/15 text-rose-700 border border-rose-200/70 hover:bg-rose-500/20'
                  : `${candyBtn} border border-transparent`
              }`}
            >
              {state.direction !== AnimationDirection.STOP ? (
                <>
                  <Pause size={16} fill="currentColor" /> Stop
                </>
              ) : (
                <>
                  <Play size={16} fill="currentColor" /> Start
                </>
              )}
            </button>

            <div className="w-px h-6 bg-slate-200 mx-2"></div>

            <button
              onClick={toggleDirectionPreference}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${candyBtnSoft}`}
            >
              {state.desiredDirection === AnimationDirection.IN ? (
                <>
                  <FastForward size={16} className="text-fuchsia-600" /> Zoom In
                </>
              ) : (
                <>
                  <FastForward size={16} className="rotate-180 text-sky-600" /> Zoom Out
                </>
              )}
            </button>
          </div>

          {/* Flow Control */}
          <div className={`hidden lg:flex rounded-xl p-1 ${frostPanel}`}>
            <button
              onClick={() => setState(s => ({ ...s, constantSpeed: !s.constantSpeed }))}
              title="Toggle Constant Visual Flow"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                state.constantSpeed
                  ? `${candyBtn}`
                  : `${candyBtnSoft}`
              }`}
            >
              <Gauge size={14} className={state.constantSpeed ? 'text-white' : 'text-slate-700'} />
              {state.constantSpeed ? 'Locked Loop' : 'Natural Flow'}
            </button>
          </div>

          {/* Mode Toggle */}
          <div className={`flex rounded-xl p-1 ${frostPanel}`}>
            <button
              onClick={() => setState(s => ({ ...s, mode: Mode.TRANSFORM }))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                state.mode === Mode.TRANSFORM ? `${candyBtn}` : `${candyBtnSoft}`
              }`}
            >
              <Maximize size={14} /> <span className="hidden sm:inline">Transform</span>
            </button>

            <button
              onClick={() => setState(s => ({ ...s, mode: Mode.CORNER }))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ml-1 ${
                state.mode === Mode.CORNER ? `${candyBtn}` : `${candyBtnSoft}`
              }`}
            >
              <MousePointer2 size={14} /> <span className="hidden sm:inline">Corner</span>
            </button>
          </div>
        </div>

        <button
          onClick={() => setState(s => ({ ...s, isExporting: true }))}
          disabled={!state.imageSrc || state.isExporting}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            state.imageSrc ? candyBtn : candyBtnSoft
          }`}
        >
          <Download size={16} /> GIF
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Stage behind canvas so the black feels intentional */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(1200px 700px at 20% 12%, rgba(255,90,170,0.12), transparent 60%),' +
              'radial-gradient(1200px 700px at 85% 12%, rgba(90,180,255,0.11), transparent 62%),' +
              'radial-gradient(900px 600px at 50% 90%, rgba(170,120,255,0.07), transparent 60%),' +
              'radial-gradient(1200px 900px at 50% 50%, rgba(2,6,23,0.92), rgba(0,0,0,0.98))',
          }}
        />

        {/* Main Canvas Area */}
        <DrosteCanvas
          state={state}
          onQuadChange={(q) => setState(s => ({ ...s, quad: q }))}
          onExportFinish={() => setState(s => ({ ...s, isExporting: false, exportProgress: 0 }))}
          setExportProgress={(p) => setState(s => ({ ...s, exportProgress: p }))}
        />

        {/* Floating Controls Overlay (Sidebar) */}
        <div className={`absolute top-20 right-4 w-64 rounded-2xl p-4 flex flex-col gap-4 ${frostPanelStrong}`}>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Recursion Depth</label>
              <span className="text-xs bg-white/70 border border-slate-200/80 px-1.5 py-0.5 rounded text-slate-700">
                {state.depth}
              </span>
            </div>
            <input
              type="range" min="1" max="20" step="1"
              value={state.depth}
              onChange={(e) => setState(s => ({ ...s, depth: parseInt(e.target.value) }))}
              className="w-full accent-fuchsia-500 h-1.5 bg-slate-200/90 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Speed</label>
              <span className="text-xs bg-white/70 border border-slate-200/80 px-1.5 py-0.5 rounded text-slate-700">
                {state.zoomSpeed.toFixed(1)}
              </span>
            </div>
            <input
              type="range" min="0.1" max="5" step="0.1"
              value={state.zoomSpeed}
              onChange={(e) => setState(s => ({ ...s, zoomSpeed: parseFloat(e.target.value) }))}
              className="w-full accent-sky-500 h-1.5 bg-slate-200/90 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div className="lg:hidden space-y-2 pt-2 border-t border-slate-200/70">
            <button
              onClick={() => setState(s => ({ ...s, constantSpeed: !s.constantSpeed }))}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-semibold ${
                state.constantSpeed ? candyBtn : candyBtnSoft
              }`}
            >
              <span className="flex items-center gap-2">
                <Gauge size={14} /> Flow Mode
              </span>
              <span className={state.constantSpeed ? 'text-white/95' : 'text-slate-700'}>
                {state.constantSpeed ? 'Locked' : 'Natural'}
              </span>
            </button>
          </div>

          <div className="text-xs text-slate-600 leading-relaxed">
            Drag corners to define the recursion area. Use <span className="font-semibold text-slate-800">Corner</span> mode for perspective distortion.
          </div>
        </div>
      </div>
    </div>
  );
}
