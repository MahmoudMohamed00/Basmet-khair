// @ts-nocheck
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, initializeFirestore, addDoc, collection, serverTimestamp, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId || '(default)');
export const auth = getAuth();
export const storage = getStorage(app);

// Configure storage timeouts
storage.maxUploadRetryTime = 1200000; // 20 minutes
storage.maxOperationRetryTime = 1200000; 

// Validate connection
async function testConnection() {
  try {
    // Attempting a simple metadata read to confirm connection
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase connection established successfully.");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn("Firestore connection check:", errorMsg);
    
    if (errorMsg.toLowerCase().includes('resource-exhausted') || errorMsg.toLowerCase().includes('quota')) {
      (window as any).__firestore_quota_exceeded__ = true;
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
    } else if (errorMsg.includes('the client is offline') || errorMsg.includes('backend didn\'t respond') || errorMsg.includes('Could not reach')) {
      console.error("Firebase connection issue: The client could not reach the Cloud Firestore backend. This might be due to network restrictions or an incorrect configuration in firebase-applet-config.json. Forced long polling is enabled.");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorStr = error instanceof Error ? error.message : String(error);
  
  if (errorStr.toLowerCase().includes('resource-exhausted') || errorStr.toLowerCase().includes('quota')) {
    (window as any).__firestore_quota_exceeded__ = true;
    window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorStr,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function logSystemAction(type: 'add' | 'delete', collectionName: string, itemId: string, itemData: any, actionDescription: string) {
  if ((window as any).__firestore_quota_exceeded__) {
    console.warn("Skipping action logging due to active database quota limit.");
    return;
  }
  try {
    await addDoc(collection(db, 'logs'), {
      userEmail: auth.currentUser?.email || 'مستخدم غير معروف',
      action: actionDescription,
      device: navigator.userAgent || 'جهاز غير معروف',
      timestamp: serverTimestamp(),
      type,
      collectionName,
      itemId,
      itemData: itemData ? JSON.stringify(itemData) : null
    });
  } catch (err) {
    const errorStr = err instanceof Error ? err.message : String(err);
    if (errorStr.toLowerCase().includes('resource-exhausted') || errorStr.toLowerCase().includes('quota')) {
      (window as any).__firestore_quota_exceeded__ = true;
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
    }
    console.error("Action logging failed:", err);
  }
}