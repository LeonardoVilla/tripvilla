import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from './firebaseConfig';

// Prevent re-initialization
export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
