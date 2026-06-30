import { supabaseAdmin } from '@/integrations/supabase/client.server';

const BUCKET = 'images';

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, '_');
}

export async function uploadToStorage(params: {
  storagePath: string;
  fileName: string;
  contentType: string;
  fileBuffer: ArrayBuffer;
}) {
  const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${sanitizeFileName(params.fileName)}`;
  const objectPath = `${params.storagePath}/${fileId}`;

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(objectPath, params.fileBuffer, {
    contentType: params.contentType || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath);
  return { url: data.publicUrl, path: objectPath };
}