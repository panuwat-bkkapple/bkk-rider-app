// src/utils/uploadImage.ts
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../api/firebase";
import imageCompression from "browser-image-compression";

const compressionOptions = {
  maxSizeMB: 0.8,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
};

const MAX_FILE_SIZE_MB = 20;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export const validateImageFile = (file: File): string | null => {
  if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)) {
    return 'รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP, HEIC)';
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `ไฟล์มีขนาดใหญ่เกินไป (สูงสุด ${MAX_FILE_SIZE_MB}MB)`;
  }
  return null;
};

export interface UploadOptions {
  /**
   * When true, the filename uploaded to Storage is a cryptographically
   * random UUID (with the original extension) instead of the predictable
   * `${Date.now()}_${file.name}`. Use this for sensitive uploads where
   * an attacker who happens to know the parent path shouldn't be able
   * to guess the filename and download directly. KYC photos use this.
   */
  opaqueFilename?: boolean;
}

export const uploadImageToFirebase = async (
  file: File,
  path: string,
  options?: UploadOptions,
): Promise<string> => {
  try {
    // Validate file before upload
    const validationError = validateImageFile(file);
    if (validationError) throw new Error(validationError);

    // Compress image before upload (reduces file size significantly)
    const compressedFile = await imageCompression(file, compressionOptions);

    let fileName: string;
    if (options?.opaqueFilename) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const uuid = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      fileName = `${uuid}.${ext || 'jpg'}`;
    } else {
      fileName = `${Date.now()}_${file.name}`;
    }
    const fullPath = `${path}/${fileName}`;
    const storageRef = ref(storage, fullPath);
    const snapshot = await uploadBytes(storageRef, compressedFile);
    return await getDownloadURL(snapshot.ref);
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
};
