import { useCallback, useEffect, useRef, useState } from 'react';
import {
  blobToRecordedAudio,
  getMicrophoneErrorMessage,
  MAX_AUDIO_DURATION_SEC,
  pickSupportedAudioMimeType,
  type RecordedAudioResult,
} from '../services/audioRecorder.ts';

export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermissionState>(() => {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.mediaDevices?.getUserMedia !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      return 'unsupported';
    }
    return 'prompt';
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const canceledRef = useRef<boolean>(false);
  const pendingResolveRef = useRef<((res: RecordedAudioResult | null) => void) | null>(null);
  const maxLimitCallbackRef = useRef<((res: RecordedAudioResult | null) => void) | null>(null);

  useEffect(() => {
    let active = true;
    let permStatus: PermissionStatus | null = null;

    if (
      typeof navigator === 'undefined' ||
      typeof navigator.mediaDevices?.getUserMedia !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      setMicPermission('unsupported');
      return;
    }

    if (typeof navigator.permissions?.query === 'function') {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          if (!active) return;
          permStatus = status;
          setMicPermission(status.state as MicPermissionState);
          status.onchange = () => {
            if (active) {
              setMicPermission(status.state as MicPermissionState);
            }
          };
        })
        .catch(() => {
          // Safari/iOS does not support querying microphone via navigator.permissions
        });
    }

    return () => {
      active = false;
      if (permStatus) {
        permStatus.onchange = null;
      }
    };
  }, []);

  const cleanupMedia = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      canceledRef.current = true;
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      cleanupMedia();
    };
  }, [cleanupMedia]);

  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    setRecorderError(null);
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.mediaDevices?.getUserMedia !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      setMicPermission('unsupported');
      setRecorderError('Gravação de áudio não suportada neste navegador.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermission('granted');
      return true;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setMicPermission('denied');
      }
      setRecorderError(getMicrophoneErrorMessage(err));
      return false;
    }
  }, []);

  const stopRecording = useCallback((): Promise<RecordedAudioResult | null> => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === 'inactive') {
      cleanupMedia();
      return Promise.resolve(null);
    }
    canceledRef.current = false;
    return new Promise((resolve) => {
      pendingResolveRef.current = resolve;
      try {
        rec.stop();
      } catch {
        pendingResolveRef.current = null;
        cleanupMedia();
        resolve(null);
      }
    });
  }, [cleanupMedia]);

  const cancelRecording = useCallback(() => {
    canceledRef.current = true;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
    if (pendingResolveRef.current) {
      pendingResolveRef.current(null);
      pendingResolveRef.current = null;
    }
    chunksRef.current = [];
    setElapsedSec(0);
    cleanupMedia();
  }, [cleanupMedia]);

  const startRecording = useCallback(
    async (onAutoLimitReached?: (res: RecordedAudioResult | null) => void): Promise<boolean> => {
      if (isRecording) return true;
      setRecorderError(null);
      maxLimitCallbackRef.current = onAutoLimitReached || null;

      if (
        typeof navigator === 'undefined' ||
        typeof navigator.mediaDevices?.getUserMedia !== 'function' ||
        typeof MediaRecorder === 'undefined'
      ) {
        setMicPermission('unsupported');
        setRecorderError('Gravação de áudio não suportada neste navegador.');
        return false;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicPermission('granted');
        mediaStreamRef.current = stream;
        chunksRef.current = [];
        canceledRef.current = false;

        const mimeType = pickSupportedAudioMimeType();
        const options: MediaRecorderOptions = { audioBitsPerSecond: 32_000 };
        if (mimeType) options.mimeType = mimeType;

        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream, options);
        } catch {
          recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        }

        mediaRecorderRef.current = recorder;
        startedAtRef.current = Date.now();
        setElapsedSec(0);
        setIsRecording(true);

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            chunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = async () => {
          const wasCanceled = canceledRef.current;
          const resolver = pendingResolveRef.current;
          pendingResolveRef.current = null;
          const autoCb = maxLimitCallbackRef.current;
          maxLimitCallbackRef.current = null;

          const durationSec = Math.max(
            1,
            Math.min(
              MAX_AUDIO_DURATION_SEC,
              Math.round((Date.now() - startedAtRef.current) / 1000)
            )
          );
          const recordedChunks = [...chunksRef.current];
          const chosenMime = recorder.mimeType || mimeType || 'audio/webm';
          chunksRef.current = [];
          cleanupMedia();

          if (wasCanceled || recordedChunks.length === 0) {
            resolver?.(null);
            return;
          }

          try {
            const blob = new Blob(recordedChunks, { type: chosenMime });
            const audio = await blobToRecordedAudio(blob, durationSec, chosenMime);
            if (resolver) {
              resolver(audio);
            } else if (autoCb) {
              autoCb(audio);
            }
          } catch (err) {
            setRecorderError(
              err instanceof Error ? err.message : 'Erro ao finalizar gravação.'
            );
            resolver?.(null);
          }
        };

        recorder.start(250);

        timerRef.current = window.setInterval(() => {
          const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
          setElapsedSec(secs);
          if (secs >= MAX_AUDIO_DURATION_SEC) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              try {
                mediaRecorderRef.current.stop();
              } catch {
                // ignore
              }
            }
          }
        }, 250);

        return true;
      } catch (err) {
        cleanupMedia();
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setMicPermission('denied');
        }
        setRecorderError(getMicrophoneErrorMessage(err));
        return false;
      }
    },
    [cleanupMedia, isRecording]
  );

  return {
    isRecording,
    elapsedSec,
    micPermission,
    recorderError,
    clearRecorderError: () => setRecorderError(null),
    requestMicrophonePermission,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
