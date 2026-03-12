// src/utils/uploadImage.ts
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../api/firebase";

export const uploadImageToFirebase = async (file: File, path: string): Promise<string> => {
  try {
    const fileName = `${Date.now()}_${file.name}`;
    const fullPath = `${path}/${fileName}`;
    const storageRef = ref(storage, fullPath);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
};