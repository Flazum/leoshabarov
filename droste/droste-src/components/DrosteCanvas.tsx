import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AppState, Quad, Point, Mode, AnimationDirection } from '../types';
import { computeHomography, invertMatrix, multiplyMatrix } from '../utils/math';
import { initGifWorker } from '../services/gifService';

interface Props {
  state: AppState;
  onQuadChange: (quad: Quad) => void;
  onExportFinish: () => void;
  setExportProgress: (val: number) => void;
}

const HANDLE_RADIUS = 8;
const ROTATION_HANDLE_OFFSET = 30;
const START_LAYER = -2; 
const MAX_EXPORT_DIMENSION = 500; 
const SAFE_COORDINATE_LIMIT = 50000; 

// Helper to calculate polygon area
function getQuadArea(p1: Point, p2: Point, p3: Point, p4: Point) {
  return 0.5 * Math.abs(
    p1.x*p2.y + p2.x*p3.y + p3.x*p4.y + p4.y*p1.x -
    (p1.y*p2.x + p2.y*p3.x + p3.y*p4.x + p4.y*p1.x)
  );
}

// Robust point transformation with clamping
function transformPointSafe(h: number[], x: number, y: number): Point | null {
  const px = h[0] * x + h[1] * y + h[2];
  const py = h[3] * x + h[4] * y + h[5];
  const w = h[6] * x + h[7] * y + h[8];
  
  if (w < 1e-4) return null;
  
  const rx = px / w;
  const ry = py / w;

  // Clamp coordinates to prevent canvas rendering crashes with infinite values
  return { 
      x: Math.max(-SAFE_COORDINATE_LIMIT, Math.min(SAFE_COORDINATE_LIMIT, rx)),
      y: Math.max(-SAFE_COORDINATE_LIMIT, Math.min(SAFE_COORDINATE_LIMIT, ry))
  };
}

// Stable Affine Triangle Drawing with Seam Healing
function drawPaddedTriangle(ctx: CanvasRenderingContext2D, screenPts: Point[], imagePts: Point[], img: HTMLImageElement, padding: number) {
   // 1. Expand SCREEN points (Destination) to cover seams
   const cx = (screenPts[0].x + screenPts[1].x + screenPts[2].x) / 3;
   const cy = (screenPts[0].y + screenPts[1].y + screenPts[2].y) / 3;

   const pad = (p: Point) => {
       if (padding <= 0) return p;
       // Small expansion to overlap adjacent triangles and hide seams
       const dx = p.x - cx;
       const dy = p.y - cy;
       return { x: cx + dx * 1.03, y: cy + dy * 1.03 };
   };

   const s0 = pad(screenPts[0]);
   const s1 = pad(screenPts[1]);
   const s2 = pad(screenPts[2]);

   const x0 = s0.x, y0 = s0.y;
   const x1 = s1.x, y1 = s1.y;
   const x2 = s2.x, y2 = s2.y;

   const u0 = imagePts[0].x, v0 = imagePts[0].y;
   const u1 = imagePts[1].x, v1 = imagePts[1].y;
   const u2 = imagePts[2].x, v2 = imagePts[2].y;

   const du1 = u1 - u0;
   const dv1 = v1 - v0;
   const du2 = u2 - u0;
   const dv2 = v2 - v0;

   const dx1 = x1 - x0;
   const dy1 = y1 - y0;
   const dx2 = x2 - x0;
   const dy2 = y2 - y0;

   const det = du1 * dv2 - du2 * dv1;
   if (Math.abs(det) < 1e-6) return;

   const invDet = 1 / det;

   const a = (dx1 * dv2 - dx2 * dv1) * invDet;
   const c = (du1 * dx2 - du2 * dx1) * invDet;
   const e = x0 - a * u0 - c * v0;

   const b = (dy1 * dv2 - dy2 * dv1) * invDet;
   const d = (du1 * dy2 - du2 * dy1) * invDet;
   const f = y0 - b * u0 - d * v0;

   ctx.save();
   ctx.beginPath();
   ctx.moveTo(x0, y0);
   ctx.lineTo(x1, y1);
   ctx.lineTo(x2, y2);
   ctx.closePath();
   
   ctx.clip();
   ctx.transform(a, b, c, d, e, f);
   ctx.drawImage(img, 0, 0);
   ctx.restore();
}

const DrosteCanvas: React.FC<Props> = ({ state, onQuadChange, onExportFinish, setExportProgress }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  
  // Animation state
  const zoomLevelRef = useRef<number>(1.0);
  const lastTimeRef = useRef<number>(0);
  const isExportingRef = useRef(false);
  const loopScaleRef = useRef<number>(1.0);
  const frameRef = useRef<number>(0);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      setCanvasSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load image
  useEffect(() => {
    if (state.imageSrc) {
      const img = new Image();
      img.onload = () => {
        setImageEl(img);
        zoomLevelRef.current = 1.0;
      };
      img.src = state.imageSrc;
    }
  }, [state.imageSrc]);

  // Handle Export Trigger
  useEffect(() => {
    if (state.isExporting && !isExportingRef.current && imageEl) {
      isExportingRef.current = true;
      generateGif();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isExporting]);

  const generateGif = async () => {
    if (!imageEl) return;
    
    // 1. Calculate Export Dimensions
    const iw = imageEl.width;
    const ih = imageEl.height;
    const aspectRatio = iw / ih;
    let exportW = iw;
    let exportH = ih;
    
    if (exportW > MAX_EXPORT_DIMENSION || exportH > MAX_EXPORT_DIMENSION) {
        if (exportW > exportH) {
            exportW = MAX_EXPORT_DIMENSION;
            exportH = Math.round(MAX_EXPORT_DIMENSION / aspectRatio);
        } else {
            exportH = MAX_EXPORT_DIMENSION;
            exportW = Math.round(MAX_EXPORT_DIMENSION * aspectRatio);
        }
    }

    // 2. Initialize GIF Worker
    let gif: any = null;
    try {
        gif = await initGifWorker(exportW, exportH);
    } catch (e) {
        console.error("Failed to init GIF worker", e);
        alert("Could not load GIF exporter. Please try again.");
        isExportingRef.current = false;
        onExportFinish();
        return;
    }

    // 3. Create offscreen canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportW;
    exportCanvas.height = exportH;
    const ctx = exportCanvas.getContext('2d', { willReadFrequently: true, alpha: false });
    
    if (!ctx) return;

    // 4. Calculate Duration & Frames based on Settings
    const scale = loopScaleRef.current;
    const speed = state.zoomSpeed || 1;
    let duration = 2.0;

    if (state.constantSpeed) {
        duration = 2.0 / speed;
    } else {
        duration = Math.log(Math.max(1.1, scale)) / speed;
    }

    duration = Math.max(0.2, Math.min(duration, 10.0));

    const targetFPS = 30; // 30 FPS for GIF is standard
    const totalFrames = Math.max(10, Math.floor(duration * targetFPS));
    const delay = Math.floor(1000 / targetFPS);

    // 5. Render Loop
    try {
      for (let i = 0; i < totalFrames; i++) {
        const t = i / totalFrames; // Normalized time 0->1
        let p = t;

        if (state.constantSpeed) {
            const Z = 1 + (scale - 1) * t;
            p = Math.log(Z) / Math.log(scale);
        } else {
            p = t;
        }

        if (state.desiredDirection === AnimationDirection.OUT) {
             p = 1.0 - p;
        }
        
        renderCanvas(ctx, true, p);
        
        gif.addFrame(ctx, { copy: true, delay: delay });
        
        setExportProgress((i + 1) / totalFrames);
        
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      setExportProgress(1.0);
      
      // 6. Finalize
      gif.on('finished', (blob: Blob) => {
          if (gif.cleanUp) gif.cleanUp();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `droste_loop_${state.constantSpeed ? 'locked' : 'flow'}.gif`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          isExportingRef.current = false;
          onExportFinish();
      });

      gif.render();

    } catch (e) {
      console.error("GIF Render loop failed", e);
      alert("Error during GIF rendering.");
      isExportingRef.current = false;
      onExportFinish();
    }
  };

  // Main Render Logic
  const renderCanvas = useCallback((ctx: CanvasRenderingContext2D, isExportMode = false, phaseOverride?: number) => {
    if (!imageEl || imageEl.width === 0 || imageEl.height === 0) return;
    
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const iw = imageEl.width;
    const ih = imageEl.height;

    // Fill background black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Current Inner Quad in Image Space
    const qPoints = {
      p1: { x: state.quad.p1.x * iw, y: state.quad.p1.y * ih },
      p2: { x: state.quad.p2.x * iw, y: state.quad.p2.y * ih },
      p3: { x: state.quad.p3.x * iw, y: state.quad.p3.y * ih },
      p4: { x: state.quad.p4.x * iw, y: state.quad.p4.y * ih },
    };

    // Calculate Loop Scale
    const areaFull = iw * ih;
    const areaQuad = getQuadArea(qPoints.p1, qPoints.p2, qPoints.p3, qPoints.p4);
    const scale = Math.sqrt(areaFull / Math.max(1, areaQuad));
    loopScaleRef.current = scale;

    let p = 0;
    if (phaseOverride !== undefined) {
        p = phaseOverride;
    } else {
        const logS = Math.log(scale);
        if (logS > 0.0001) {
            p = Math.log(Math.max(1, zoomLevelRef.current)) / logS;
        }
    }
    p = p - Math.floor(p);

    const lerp = (a: Point, b: Point, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    
    const screenRect = {
      p1: { x: 0, y: 0 },
      p2: { x: iw, y: 0 },
      p3: { x: iw, y: ih },
      p4: { x: 0, y: ih }
    };

    const vp = {
      p1: lerp(screenRect.p1, qPoints.p1, p),
      p2: lerp(screenRect.p2, qPoints.p2, p),
      p3: lerp(screenRect.p3, qPoints.p3, p),
      p4: lerp(screenRect.p4, qPoints.p4, p),
    };

    // Matrices
    const M = computeHomography(iw, ih, vp);
    const K = invertMatrix(M);
    const H = computeHomography(iw, ih, qPoints);
    const HInv = invertMatrix(H);

    // Canvas Transform
    const scaleToFit = Math.min(width / iw, height / ih) * 0.9;
    const offsetX = (width - iw * scaleToFit) / 2;
    const offsetY = (height - ih * scaleToFit) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scaleToFit, scaleToFit);

    // Culling Rect in Local Coords (for grid cells, not whole layers)
    const cullRect = {
      x: -offsetX / scaleToFit,
      y: -offsetY / scaleToFit,
      w: width / scaleToFit,
      h: height / scaleToFit
    };

    let currentH = [1,0,0,0,1,0,0,0,1]; 
    for(let k=0; k < Math.abs(START_LAYER); k++) {
       currentH = multiplyMatrix(currentH, HInv); 
    }

    // --- LOD System ---
    const baseGridSize = isExportMode ? 20 : 10; 
    
    for (let j = START_LAYER; j < state.depth; j++) {
        const layerMatrix = multiplyMatrix(K, currentH);
        
        // 1. Check Bounds & Auto-LOD
        const corners = [
            transformPointSafe(layerMatrix, 0, 0),
            transformPointSafe(layerMatrix, iw, 0),
            transformPointSafe(layerMatrix, iw, ih),
            transformPointSafe(layerMatrix, 0, ih)
        ];

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let validPoints = 0;
        for(const pt of corners) {
            if(pt) {
                if(pt.x < minX) minX = pt.x;
                if(pt.x > maxX) maxX = pt.x;
                if(pt.y < minY) minY = pt.y;
                if(pt.y > maxY) maxY = pt.y;
                validPoints++;
            }
        }

        const projectedWidth = maxX - minX;
        const projectedHeight = maxY - minY;
        
        // Performance Fix: Stop recursing if the layer is sub-pixel (invisible)
        // This prevents thousands of tiny draw calls for deep iterations.
        if (validPoints > 0 && (projectedWidth < 0.5 || projectedHeight < 0.5)) {
           break;
        }

        // 2. Determine Grid Size for this layer
        let gridSize = 2;
        if (validPoints < 4) {
             // Warped outer layers need more geometry to look straight
             gridSize = isExportMode ? 16 : 10;
        } else {
             const metric = Math.max(projectedWidth, projectedHeight);
             const calculated = Math.floor(metric / 150);
             gridSize = Math.max(2, Math.min(baseGridSize, calculated));
        }

        // 3. Draw Grid
        for(let y=0; y<gridSize; y++) {
            for(let x=0; x<gridSize; x++) {
              const nx1 = x/gridSize, ny1 = y/gridSize;
              const nx2 = (x+1)/gridSize, ny2 = (y+1)/gridSize;
              
              const p1 = transformPointSafe(layerMatrix, nx1*iw, ny1*ih);
              const p2 = transformPointSafe(layerMatrix, nx2*iw, ny1*ih);
              const p3 = transformPointSafe(layerMatrix, nx1*iw, ny2*ih);
              const p4 = transformPointSafe(layerMatrix, nx2*iw, ny2*ih);

              // Source UVs
              const u1 = nx1*iw, v1 = ny1*ih;
              const u2 = nx2*iw, v2 = ny1*ih;
              const u3 = nx1*iw, v2_ = ny2*ih;
              const u4 = nx2*iw, v4 = ny2*ih;

              // Simple Center Cull
              // Only cull individual grid cells if they are REALLY far off screen
              const cx = (p1?.x || 0 + p2?.x || 0 + p3?.x || 0) / 3;
              const cy = (p1?.y || 0 + p2?.y || 0 + p3?.y || 0) / 3;
              if (cx < cullRect.x - 5000 || cx > cullRect.x + cullRect.w + 5000 || 
                  cy < cullRect.y - 5000 || cy > cullRect.y + cullRect.h + 5000) {
                   continue;
              } 

              const padding = isExportMode ? 1.0 : 1.0; 

              if (p1 && p2 && p3) {
                 drawPaddedTriangle(ctx, [p1, p2, p3], [{x:u1,y:v1}, {x:u2,y:v2}, {x:u3,y:v2_}], imageEl, padding);
              }
              if (p2 && p4 && p3) {
                 drawPaddedTriangle(ctx, [p2, p4, p3], [{x:u2,y:v2}, {x:u4,y:v4}, {x:u3,y:v2_}], imageEl, padding);
              }
            }
        }
        currentH = multiplyMatrix(currentH, H);
    }

    ctx.restore();

    // UI Overlay (Handles)
    if (!isExportMode && state.imageSrc && state.direction === AnimationDirection.STOP) {
       ctx.save();
       ctx.translate(offsetX, offsetY);
       ctx.scale(scaleToFit, scaleToFit);
       
       ctx.strokeStyle = '#3b82f6';
       ctx.lineWidth = 2 / scaleToFit;
       ctx.beginPath();
       ctx.moveTo(qPoints.p1.x, qPoints.p1.y);
       ctx.lineTo(qPoints.p2.x, qPoints.p2.y);
       ctx.lineTo(qPoints.p3.x, qPoints.p3.y);
       ctx.lineTo(qPoints.p4.x, qPoints.p4.y);
       ctx.closePath();
       ctx.stroke();

       const radius = HANDLE_RADIUS / scaleToFit;
       ctx.fillStyle = 'white';
       const drawHandle = (p: Point) => {
         ctx.beginPath();
         ctx.arc(p.x, p.y, radius, 0, Math.PI*2);
         ctx.fill();
         ctx.stroke();
       };
       drawHandle(qPoints.p1);
       drawHandle(qPoints.p2);
       drawHandle(qPoints.p3);
       drawHandle(qPoints.p4);

       if (state.mode === Mode.TRANSFORM) {
          const topMidX = (qPoints.p1.x + qPoints.p2.x) / 2;
          const topMidY = (qPoints.p1.y + qPoints.p2.y) / 2;
          const cx = (qPoints.p1.x + qPoints.p2.x + qPoints.p3.x + qPoints.p4.x) / 4;
          const cy = (qPoints.p1.y + qPoints.p2.y + qPoints.p3.y + qPoints.p4.y) / 4;
          
          const dx = topMidX - cx;
          const dy = topMidY - cy;
          const len = Math.sqrt(dx*dx + dy*dy) || 1;
          const rx = topMidX + (dx/len) * (ROTATION_HANDLE_OFFSET / scaleToFit);
          const ry = topMidY + (dy/len) * (ROTATION_HANDLE_OFFSET / scaleToFit);

          ctx.beginPath();
          ctx.moveTo(topMidX, topMidY);
          ctx.lineTo(rx, ry);
          ctx.strokeStyle = 'white';
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(rx, ry, radius, 0, Math.PI*2);
          ctx.fillStyle = '#ef4444';
          ctx.fill();
          ctx.stroke();
       }
       ctx.restore();
    }
  }, [imageEl, state.depth, state.quad, state.mode, state.imageSrc, state.direction]);


  // Animation Loop
  useEffect(() => {
    const loop = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      if (state.direction !== AnimationDirection.STOP && !isExportingRef.current && imageEl) {
        const limit = loopScaleRef.current;
        const speed = state.zoomSpeed;
        
        if (state.constantSpeed) {
            const step = speed * dt * 0.5; 
            if (state.direction === AnimationDirection.IN) {
                zoomLevelRef.current += step * (limit - 1); 
                if (zoomLevelRef.current >= limit) zoomLevelRef.current = 1 + (zoomLevelRef.current - limit);
            } else {
                zoomLevelRef.current -= step * (limit - 1);
                if (zoomLevelRef.current < 1.0) zoomLevelRef.current = limit - (1.0 - zoomLevelRef.current);
            }
        } else {
            const step = 1 + (speed * dt); 
            if (state.direction === AnimationDirection.IN) {
                zoomLevelRef.current *= step;
                if (zoomLevelRef.current >= limit) zoomLevelRef.current /= limit; 
            } else {
                zoomLevelRef.current /= step;
                if (zoomLevelRef.current < 1.0) zoomLevelRef.current *= limit;
            }
        }
      }

      if (canvasRef.current && !isExportingRef.current) {
        const ctx = canvasRef.current.getContext('2d', { alpha: false });
        if (ctx) renderCanvas(ctx, false);
      }
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [state.direction, state.zoomSpeed, state.constantSpeed, state.quad, imageEl, renderCanvas]);

  // Input Handling
  const getMousePos = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current || !imageEl) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;

    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    const iw = imageEl.width;
    const ih = imageEl.height;
    const scaleToFit = Math.min(width / iw, height / ih) * 0.9;
    const offsetX = (width - iw * scaleToFit) / 2;
    const offsetY = (height - ih * scaleToFit) / 2;

    const nx = (cx - offsetX) / scaleToFit / iw;
    const ny = (cy - offsetY) / scaleToFit / ih;

    return { nx, ny, cx, cy, scale: scaleToFit };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (state.direction !== AnimationDirection.STOP) return;
    const pos = getMousePos(e);
    if (!pos || !imageEl) return;
    const { nx, ny, scale } = pos;
    const threshold = (HANDLE_RADIUS * 2) / scale / imageEl.width;
    const dist = (p: Point) => Math.hypot(p.x - nx, p.y - ny);

    if (dist(state.quad.p1) < threshold) return setDragTarget('p1');
    if (dist(state.quad.p2) < threshold) return setDragTarget('p2');
    if (dist(state.quad.p3) < threshold) return setDragTarget('p3');
    if (dist(state.quad.p4) < threshold) return setDragTarget('p4');

    if (state.mode === Mode.TRANSFORM) {
        const iw = imageEl.width;
        const ih = imageEl.height;
        const cx = (state.quad.p1.x + state.quad.p2.x + state.quad.p3.x + state.quad.p4.x) / 4;
        const cy = (state.quad.p1.y + state.quad.p2.y + state.quad.p3.y + state.quad.p4.y) / 4;
        const topMidX = (state.quad.p1.x + state.quad.p2.x) / 2;
        const topMidY = (state.quad.p1.y + state.quad.p2.y) / 2;
        const dx = (topMidX - cx) * iw;
        const dy = (topMidY - cy) * ih;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        const rx = topMidX + (dx/len) * (ROTATION_HANDLE_OFFSET / scale / iw);
        const ry = topMidY + (dy/len) * (ROTATION_HANDLE_OFFSET / scale / ih);
        if (Math.hypot(rx - nx, ry - ny) < threshold) return setDragTarget('rotate');
    }

    const minX = Math.min(state.quad.p1.x, state.quad.p4.x);
    const maxX = Math.max(state.quad.p2.x, state.quad.p3.x);
    const minY = Math.min(state.quad.p1.y, state.quad.p2.y);
    const maxY = Math.max(state.quad.p3.y, state.quad.p4.y);
    if (nx > minX && nx < maxX && ny > minY && ny < maxY) setDragTarget('move');
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
     if (!dragTarget || !imageEl) return;
     const pos = getMousePos(e);
     if (!pos) return;
     const { nx, ny } = pos;
     
     const newQuad = { ...state.quad };

     if (state.mode === Mode.CORNER) {
        if (dragTarget === 'p1') newQuad.p1 = { x: nx, y: ny };
        if (dragTarget === 'p2') newQuad.p2 = { x: nx, y: ny };
        if (dragTarget === 'p3') newQuad.p3 = { x: nx, y: ny };
        if (dragTarget === 'p4') newQuad.p4 = { x: nx, y: ny };
        if (dragTarget === 'move') {
            const dx = nx - (newQuad.p1.x + newQuad.p2.x + newQuad.p3.x + newQuad.p4.x)/4;
            const dy = ny - (newQuad.p1.y + newQuad.p2.y + newQuad.p3.y + newQuad.p4.y)/4;
            newQuad.p1.x += dx; newQuad.p1.y += dy;
            newQuad.p2.x += dx; newQuad.p2.y += dy;
            newQuad.p3.x += dx; newQuad.p3.y += dy;
            newQuad.p4.x += dx; newQuad.p4.y += dy;
        }
     } else {
        const center = { x: (newQuad.p1.x + newQuad.p3.x)/2, y: (newQuad.p1.y + newQuad.p3.y)/2 };
        if (dragTarget === 'move') {
             const dx = nx - center.x;
             const dy = ny - center.y;
             const move = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
             newQuad.p1 = move(newQuad.p1);
             newQuad.p2 = move(newQuad.p2);
             newQuad.p3 = move(newQuad.p3);
             newQuad.p4 = move(newQuad.p4);
        } else if (dragTarget === 'rotate') {
             const tmX = (newQuad.p1.x + newQuad.p2.x)/2;
             const tmY = (newQuad.p1.y + newQuad.p2.y)/2;
             const oldAngle = Math.atan2(tmY - center.y, tmX - center.x);
             const newAngle = Math.atan2(ny - center.y, nx - center.x);
             const rot = newAngle - oldAngle;
             const rotate = (p: Point) => {
                const px = p.x - center.x;
                const py = p.y - center.y;
                return {
                    x: px * Math.cos(rot) - py * Math.sin(rot) + center.x,
                    y: px * Math.sin(rot) + py * Math.cos(rot) + center.y
                };
             };
             newQuad.p1 = rotate(newQuad.p1);
             newQuad.p2 = rotate(newQuad.p2);
             newQuad.p3 = rotate(newQuad.p3);
             newQuad.p4 = rotate(newQuad.p4);
        } else if (['p1','p2','p3','p4'].includes(dragTarget)) {
            const distOld = Math.hypot(state.quad[dragTarget as keyof Quad].x - center.x, state.quad[dragTarget as keyof Quad].y - center.y) || 1;
            const distNew = Math.hypot(nx - center.x, ny - center.y);
            const scale = distNew / distOld;
            const scalePt = (p: Point) => ({ x: center.x + (p.x - center.x) * scale, y: center.y + (p.y - center.y) * scale });
            newQuad.p1 = scalePt(newQuad.p1);
            newQuad.p2 = scalePt(newQuad.p2);
            newQuad.p3 = scalePt(newQuad.p3);
            newQuad.p4 = scalePt(newQuad.p4);
        }
     }
     onQuadChange(newQuad);
  };

  const handlePointerUp = () => setDragTarget(null);

  return (
    <div 
      ref={containerRef}
      className="flex-1 relative h-full bg-black flex items-center justify-center overflow-hidden cursor-crosshair"
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
    >
      {!state.imageSrc && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-gray-500">Upload an image to start</p>
        </div>
      )}
      <canvas ref={canvasRef} width={canvasSize.width} height={canvasSize.height} className="block touch-none" />
      {state.isExporting && (
         <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-black/80 px-4 py-2 rounded text-white font-mono z-50 whitespace-nowrap">
            Generating GIF Loop... {(state.exportProgress * 100).toFixed(0)}%
         </div>
      )}
    </div>
  );
};

export default DrosteCanvas;