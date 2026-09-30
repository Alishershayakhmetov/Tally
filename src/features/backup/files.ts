import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Native: the backup is written to the cache and handed to the share sheet
// (Drive, Telegram, email, Files…). Import uses the system file picker.

export async function shareBackupFile(fileName: string, json: string, dialogTitle: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle });
}

/** The picked file's text, or null if the user cancelled. */
export async function pickBackupFile(): Promise<string | null> {
  // Providers label .json inconsistently (application/json, octet-stream, text/plain),
  // so any file can be picked; parseBackup() rejects what isn't a backup.
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return null;
  return picked.result.text();
}
