// src/utils/cameraService.js
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

/**
 * Check if the application is running in a native Capacitor environment (Android/iOS)
 */
export const isNativeApp = () => Capacitor.isNativePlatform();

/**
 * Check camera and photo library permissions
 * @returns {Promise<{ camera: string, photos: string }>}
 */
export async function checkCameraPermissions() {
  try {
    if (isNativeApp()) {
      const status = await Camera.checkPermissions();
      return status;
    }
    return { camera: 'granted', photos: 'granted' };
  } catch (err) {
    console.warn('Error checking camera permissions:', err);
    return { camera: 'prompt', photos: 'prompt' };
  }
}

/**
 * Request camera and photo library permissions explicitly
 * Useful to call before starting any camera-based flows (e.g. face scan, ID photo capture)
 * @returns {Promise<{ camera: string, photos: string }>}
 */
export async function requestCameraPermissions() {
  try {
    if (isNativeApp()) {
      const result = await Camera.requestPermissions({
        permissions: ['camera', 'photos']
      });
      return result;
    }
    // Web fallback using getUserMedia permission query
    if (navigator?.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      return { camera: 'granted', photos: 'granted' };
    }
    return { camera: 'granted', photos: 'granted' };
  } catch (err) {
    console.error('Failed to request camera permission:', err);
    throw err;
  }
}

/**
 * Capture a photo using the device camera
 * @param {Object} [options]
 * @param {number} [options.quality=90]
 * @param {boolean} [options.allowEditing=false]
 * @param {'base64' | 'dataUrl' | 'uri'} [options.format='dataUrl']
 * @returns {Promise<{ dataUrl?: string, base64String?: string, webPath?: string, format?: string }>}
 */
export async function capturePhoto(options = {}) {
  const resultType =
    options.format === 'base64'
      ? CameraResultType.Base64
      : options.format === 'uri'
      ? CameraResultType.Uri
      : CameraResultType.DataUrl;

  try {
    const image = await Camera.getPhoto({
      quality: options.quality || 90,
      allowEditing: options.allowEditing || false,
      resultType,
      source: CameraSource.Camera,
      saveToGallery: options.saveToGallery || false,
      promptLabelHeader: 'Camera',
      promptLabelPhoto: 'From Photos',
      promptLabelPicture: 'Take Picture'
    });

    return {
      dataUrl: image.dataUrl,
      base64String: image.base64String,
      webPath: image.webPath,
      format: image.format
    };
  } catch (err) {
    console.error('Camera capture error:', err);
    throw err;
  }
}

/**
 * Pick an image from the photo gallery / file picker
 * @param {Object} [options]
 * @param {number} [options.quality=90]
 * @param {'base64' | 'dataUrl' | 'uri'} [options.format='dataUrl']
 * @returns {Promise<{ dataUrl?: string, base64String?: string, webPath?: string, format?: string }>}
 */
export async function pickPhotoFromGallery(options = {}) {
  const resultType =
    options.format === 'base64'
      ? CameraResultType.Base64
      : options.format === 'uri'
      ? CameraResultType.Uri
      : CameraResultType.DataUrl;

  try {
    const image = await Camera.getPhoto({
      quality: options.quality || 90,
      allowEditing: options.allowEditing || false,
      resultType,
      source: CameraSource.Photos
    });

    return {
      dataUrl: image.dataUrl,
      base64String: image.base64String,
      webPath: image.webPath,
      format: image.format
    };
  } catch (err) {
    console.error('Gallery pick error:', err);
    throw err;
  }
}
