// Web: expo-file-system and the share sheet don't exist in the browser. The
// Windows app asks the system's Save As window (through its main process);
// a plain browser downloads the file. Import uses an <input type="file"> in both.

import { getDesktop } from '@/desktop/bridge';

/** False when the user cancelled the Save As window. */
export async function shareBackupFile(
  fileName: string,
  json: string,
  _dialogTitle: string,
): Promise<boolean> {
  const desktop = getDesktop();
  if (desktop) return (await desktop.files.save(fileName, json)) !== null;
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) resolve(null);
      else file.text().then(resolve, () => resolve(null));
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
