// @ts-nocheck
/**
 * Utility to upload files to Google Drive via the backend API
 */
export async function uploadToGoogleDrive(file: File, section: string, caseId?: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('section', section);
  if (caseId) {
    formData.append('caseId', caseId);
  }

  const response = await fetch('/api/upload-to-drive', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to upload to Google Drive');
  }

  return await response.json();
}