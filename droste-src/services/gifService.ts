// Helper to initialize a configured GIF instance
export const initGifWorker = async (width: number, height: number): Promise<any> => {
  if (!window.GIF) {
    throw new Error("GIF.js library not loaded");
  }

  // Load worker code locally to avoid cross-origin restrictions
  let workerBlobUrl = '';
  try {
      const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
      if (!response.ok) throw new Error('Network response was not ok');
      const workerScript = await response.text();
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      workerBlobUrl = URL.createObjectURL(blob);
  } catch (e) {
      console.warn("Falling back to CDN for GIF worker", e);
      workerBlobUrl = 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js';
  }

  const gif = new window.GIF({
    workers: 2,
    quality: 10,
    width,
    height,
    workerScript: workerBlobUrl,
    transparent: null,
    background: '#000000'
  });

  // Attach a custom cleanup method to the instance for later use
  (gif as any).cleanUp = () => {
     if (workerBlobUrl.startsWith('blob:')) {
         URL.revokeObjectURL(workerBlobUrl);
     }
  };

  return gif;
};
