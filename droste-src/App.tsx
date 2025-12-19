import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Mode, AnimationDirection, Quad, AppState } from './types';
import DrosteCanvas from './components/DrosteCanvas';
import { Upload, Play, Pause, Square, MousePointer2, Image as ImageIcon, Download, Maximize, ArrowRightLeft, FastForward, Gauge, Wand2, Loader2, FileUp } from 'lucide-react';
import { removeBackground } from '@imgly/background-removal';

const INITIAL_QUAD: Quad = {
  p1: { x: 0.25, y: 0.25 },
  p2: { x: 0.75, y: 0.25 },
  p3: { x: 0.75, y: 0.75 },
  p4: { x: 0.25, y: 0.75 },
};

export default function App() {
  const [state, setState] = useState<AppState>({
    imageSrc: null,
    imageDimensions: { width: 0, height: 0 },
    quad: INITIAL_QUAD,
    mode: Mode.TRANSFORM,
    depth: 10,
    zoomSpeed: 1.0, // Default to 1
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

  // Reusable Image Loader
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
        alert("Failed to load image.");
    };
    img.src = src;
  }, []);

  // Central File Processor
  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
        alert("Please upload a valid image file (PNG, JPEG, etc).");
        return;
    }

    if (state.shouldRemoveBackground) {
      setState(prev => ({ ...prev, isProcessing: true }));
      try {
        const blob = await removeBackground(file);
        const url = URL.createObjectURL(blob);
        loadImage(url);
      } catch (err) {
        console.error("Background removal failed:", err);
        alert("Could not remove background. Loading original image instead.");
        // Fallback to standard load
        const reader = new FileReader();
        reader.onload = (e) => {
            if(e.target?.result) loadImage(e.target.result as string);
        };
        reader.readAsDataURL(file);
      }
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            if(e.target?.result) loadImage(e.target.result as string);
        };
        reader.readAsDataURL(file);
    }
  }, [state.shouldRemoveBackground, loadImage]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // Drag and Drop Handlers
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
      if (file) {
          processFile(file);
      }
  };

  // Paste Support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    e.preventDefault(); // Prevent pasting into inputs if focused
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

  return (
    <div 
        className="flex flex-col h-screen w-screen bg-slate-900 text-white font-sans overflow-hidden relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-blue-500/20 backdrop-blur-sm border-4 border-blue-500 border-dashed m-4 rounded-xl flex items-center justify-center pointer-events-none">
           <div className="bg-slate-900/90 p-8 rounded-2xl flex flex-col items-center shadow-2xl animate-bounce">
              <FileUp size={48} className="text-blue-400 mb-4" />
              <h2 className="text-2xl font-bold text-white">Drop Image Here</h2>
           </div>
        </div>
      )}

      {/* Processing Overlay */}
      {state.isProcessing && (
        <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center">
           <Loader2 className="animate-spin text-blue-500 mb-4" size={48} />
           <p className="text-xl font-light">Processing Image...</p>
           {state.shouldRemoveBackground && <p className="text-sm text-slate-400 mt-2">Removing background (this may take a moment)</p>}
        </div>
      )}

      {/* Toolbar */}
      <div className="h-16 border-b border-slate-700 bg-slate-800 flex items-center px-4 justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent hidden md:block">
            Droste<span className="font-light text-white">Infinite</span>
          </h1>
          
          <div className="flex items-center bg-slate-900 rounded-lg p-1 border border-slate-700">
            <label className="flex items-center gap-2 cursor-pointer bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded transition-colors text-sm font-medium shadow-sm">
              <Upload size={16} />
              <span>Upload</span>
              <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} className="hidden" />
            </label>
            <div className="w-px h-6 bg-slate-700 mx-2"></div>
            <button
               onClick={() => setState(s => ({ ...s, shouldRemoveBackground: !s.shouldRemoveBackground }))}
               className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${state.shouldRemoveBackground ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/50' : 'text-slate-400 hover:text-slate-300'}`}
               title="Automatically remove background from uploaded images"
            >
               <Wand2 size={14} />
               <span>Remove BG</span>
               <div className={`w-8 h-4 rounded-full relative transition-colors ${state.shouldRemoveBackground ? 'bg-purple-500' : 'bg-slate-600'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${state.shouldRemoveBackground ? 'left-4.5 translate-x-4' : 'left-0.5'}`} />
               </div>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
           {/* Controls Group */}
           <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700 items-center">
              <button 
                onClick={togglePlay}
                disabled={!state.imageSrc}
                className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm transition-all font-medium ${
                  state.direction !== AnimationDirection.STOP 
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                    : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                }`}
              >
                {state.direction !== AnimationDirection.STOP ? (
                  <><Pause size={16} fill="currentColor" /> Stop</>
                ) : (
                  <><Play size={16} fill="currentColor" /> Start</>
                )}
              </button>
              
              <div className="w-px h-6 bg-slate-700 mx-2"></div>

              <button 
                onClick={toggleDirectionPreference}
                className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                {state.desiredDirection === AnimationDirection.IN ? (
                  <><FastForward size={16} /> Zoom In</>
                ) : (
                   <><FastForward size={16} className="rotate-180" /> Zoom Out</>
                )}
              </button>
           </div>
            
           {/* Flow Control */}
           <div className="hidden lg:flex bg-slate-900 rounded-lg p-1 border border-slate-700">
              <button 
                onClick={() => setState(s => ({ ...s, constantSpeed: !s.constantSpeed }))}
                title="Toggle Constant Visual Flow"
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all ${state.constantSpeed ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                <Gauge size={14} /> {state.constantSpeed ? 'Locked Loop' : 'Natural Flow'}
              </button>
           </div>
           
           {/* Mode Toggle */}
           <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
              <button 
                onClick={() => setState(s => ({ ...s, mode: Mode.TRANSFORM }))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all ${state.mode === Mode.TRANSFORM ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                <Maximize size={14} /> <span className="hidden sm:inline">Transform</span>
              </button>
              <button 
                onClick={() => setState(s => ({ ...s, mode: Mode.CORNER }))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all ${state.mode === Mode.CORNER ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                <MousePointer2 size={14} /> <span className="hidden sm:inline">Corner</span>
              </button>
           </div>
        </div>

        <button 
          onClick={() => setState(s => ({ ...s, isExporting: true }))}
          disabled={!state.imageSrc || state.isExporting}
          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          <Download size={16} /> GIF
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Canvas Area */}
        <DrosteCanvas 
          state={state} 
          onQuadChange={(q) => setState(s => ({ ...s, quad: q }))}
          onExportFinish={() => setState(s => ({ ...s, isExporting: false, exportProgress: 0 }))}
          setExportProgress={(p) => setState(s => ({ ...s, exportProgress: p }))}
        />

        {/* Floating Controls Overlay (Sidebar) */}
        <div className="absolute top-20 right-4 w-64 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-xl p-4 shadow-2xl flex flex-col gap-4">
           <div className="space-y-2">
             <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-400 uppercase">Recursion Depth</label>
                <span className="text-xs bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">{state.depth}</span>
             </div>
             <input 
               type="range" min="1" max="20" step="1" 
               value={state.depth} 
               onChange={(e) => setState(s => ({ ...s, depth: parseInt(e.target.value) }))}
               className="w-full accent-blue-500 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer"
             />
           </div>

           <div className="space-y-2">
             <div className="flex justify-between items-center">
               <label className="text-xs font-semibold text-slate-400 uppercase">Speed</label>
               <span className="text-xs bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">{state.zoomSpeed.toFixed(1)}</span>
             </div>
             <input 
               type="range" min="0.1" max="5" step="0.1" 
               value={state.zoomSpeed} 
               onChange={(e) => setState(s => ({ ...s, zoomSpeed: parseFloat(e.target.value) }))}
               className="w-full accent-blue-500 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer"
             />
           </div>

           <div className="lg:hidden space-y-2 pt-2 border-t border-slate-700">
               <button 
                  onClick={() => setState(s => ({ ...s, constantSpeed: !s.constantSpeed }))}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs bg-slate-900 border border-slate-700 text-slate-300"
                >
                  <span className="flex items-center gap-2"><Gauge size={14}/> Flow Mode</span>
                  <span className="font-semibold text-blue-400">{state.constantSpeed ? 'Locked' : 'Natural'}</span>
                </button>
           </div>
           
           <div className="text-xs text-slate-500 mt-2 leading-relaxed">
             Drag corners to define the recursion area. Use "Corner" mode for perspective distortion.
           </div>
        </div>
      </div>
    </div>
  );
}
