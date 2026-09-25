// src/utils/faceRecognition.js
import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;
let modelLoadingPromise = null;

/**
 * Load Face API neural network models from /models directory (in public folder)
 */
export async function loadFaceApiModels() {
  if (modelsLoaded) return true;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      const MODEL_URL = '/models';
      
      // Load SSD MobileNet or Tiny Face Detector, Landmarks, and Face Recognition Net
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);

      modelsLoaded = true;
      console.log('✅ Face API models loaded successfully');
      return true;
    } catch (err) {
      console.error('❌ Failed to load Face API models from /models, trying tiny models fallback:', err);
      try {
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        modelsLoaded = true;
        return true;
      } catch (fallbackErr) {
        console.error('❌ Failed to load fallback models:', fallbackErr);
        throw fallbackErr;
      }
    }
  })();

  return modelLoadingPromise;
}

/**
 * Check if models are currently loaded
 */
export function areModelsLoaded() {
  return modelsLoaded;
}

/**
 * Detect a single face in a video or image element and return its 128-d descriptor vector
 * @param {HTMLVideoElement | HTMLImageElement | HTMLCanvasElement} inputElement
 * @returns {Promise<{ descriptor: number[], box: { x: number, y: number, width: number, height: number } } | null>}
 */
export async function getFaceDescriptor(inputElement) {
  if (!inputElement) return null;
  await loadFaceApiModels();

  try {
    // Try detection with SSD MobileNet first for highest accuracy
    let result = null;
    if (faceapi.nets.ssdMobilenetv1.isLoaded) {
      result = await faceapi
        .detectSingleFace(inputElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
    }

    // Fallback to Tiny Face Detector if SSD MobileNet isn't loaded or didn't find
    if (!result && faceapi.nets.tinyFaceDetector.isLoaded) {
      result = await faceapi
        .detectSingleFace(inputElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();
    }

    if (!result || !result.descriptor) {
      return null;
    }

    return {
      descriptor: Array.from(result.descriptor),
      box: result.detection?.box || null,
      score: result.detection?.score || 0
    };
  } catch (err) {
    console.error('Error during face detection & descriptor extraction:', err);
    return null;
  }
}

/**
 * Capture a lightweight base64 thumbnail image snapshot from a video element
 * @param {HTMLVideoElement} videoElement
 * @param {number} maxWidth
 * @param {number} maxHeight
 * @returns {string} base64 data URL
 */
export function captureVideoSnapshot(videoElement, maxWidth = 320, maxHeight = 240) {
  if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
    return '';
  }

  const canvas = document.createElement('canvas');
  let width = videoElement.videoWidth;
  let height = videoElement.videoHeight;

  // Scale down to maintain aspect ratio within max bounds
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  // Draw image to canvas
  ctx.drawImage(videoElement, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', 0.85);
}
