export interface RecordedAudioResult {
  dataUrl: string;
  base64: string;
  mimeType: string;
  durationSec: number;
}

export const MAX_AUDIO_DURATION_SEC = 60;

export function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    } catch {
      // ignore
    }
  }
  return '';
}

export function normalizeAudioMimeType(rawMime: string): string {
  const base = String(rawMime || 'audio/webm')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!base) return 'audio/webm';
  if (base === 'video/webm') return 'audio/webm';
  if (base === 'video/mp4') return 'audio/mp4';
  if (base.startsWith('audio/')) return base;
  return 'audio/webm';
}

export function formatAudioDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function blobToRecordedAudio(
  blob: Blob,
  durationSec: number,
  fallbackMime: string
): Promise<RecordedAudioResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      if (!result.startsWith('data:') || commaIdx < 0) {
        reject(new Error('Não foi possível processar o áudio gravado.'));
        return;
      }
      const header = result.slice(5, commaIdx);
      const rawMime = header.split(';')[0] || blob.type || fallbackMime || 'audio/webm';
      const normalizedMime = normalizeAudioMimeType(rawMime);
      const base64 = result.slice(commaIdx + 1);
      const cleanDataUrl = `data:${normalizedMime};base64,${base64}`;
      resolve({
        dataUrl: cleanDataUrl,
        base64,
        mimeType: normalizedMime,
        durationSec: Math.max(1, Math.round(durationSec)),
      });
    };
    reader.onerror = () => {
      reject(new Error('Falha ao ler o arquivo de áudio gravado.'));
    };
    reader.readAsDataURL(blob);
  });
}

export function getMicrophoneErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Permissão de microfone recusada. Libere o microfone no navegador para gravar áudio.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Nenhum microfone encontrado neste aparelho.';
  }
  if (name === 'NotReadableError') {
    return 'Microfone em uso por outro aplicativo. Feche e tente novamente.';
  }
  return 'Não foi possível iniciar a gravação de áudio neste aparelho.';
}
