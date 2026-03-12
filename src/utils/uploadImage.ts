// src/utils/uploadImage.ts
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../api/firebase";
import imageCompression from "browser-image-compression";

const compressionOptions = {
  maxSizeMB: 0.8,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
};

export const uploadImageToFirebase = async (file: File, path: string): Promise<string> => {
  try {
    // Compress image before upload (reduces file size significantly)
    const compressedFile = await imageCompression(file, compressionOptions);

    const fileName = `${Date.now()}_${file.name}`;
    const fullPath = `${path}/${fileName}`;
    const storageRef = ref(storage, fullPath);
    const snapshot = await uploadBytes(storageRef, compressedFile);
    return await getDownloadURL(snapshot.ref);
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
};
