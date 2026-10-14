import { useState, useRef, useEffect, useCallback } from 'react';

export type AudioRecorderStatus = 'idle' | 'recording' | 'transcribing' | 'error';

interface UseAudioRecorderOptions {
  maxDurationSeconds?: number;
  maxSizeBytes?: number;
  onAudioRecorded?: (blob: Blob) => void | Promise<void>;
  onError?: (errorMessageKey: string) => void;
}

export function useAudioRecorder({
  maxDurationSeconds = 90,
  maxSizeBytes = 5 * 1024 * 1024,
  onAudioRecorded,
  onError,
}: UseAudioRecorderOptions = {}) {
  const [status, setStatus] = useState<AudioRecorderStatus>('idle');
  const [duration, setDuration] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    clearTimer();
    stopTracks();
  }, [clearTimer, stopTracks]);

  const cancelRecording = useCallback(() => {
    audioChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    clearTimer();
    stopTracks();
    setStatus('idle');
    setDuration(0);
    setErrorKey(null);
  }, [clearTimer, stopTracks]);

  const startRecording = useCallback(async () => {
    setErrorKey(null);
    audioChunksRef.current = [];
    setDuration(0);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorKey('vacancyGenerator.micPermissionDenied');
      onError?.('vacancyGenerator.micPermissionDenied');
      setStatus('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        if (audioBlob.size > maxSizeBytes) {
          setErrorKey('vacancyGenerator.audioTooLarge');
          onError?.('vacancyGenerator.audioTooLarge');
          setStatus('error');
          return;
        }

        if (audioBlob.size === 0) {
          setStatus('idle');
          return;
        }

        setStatus('transcribing');
        try {
          if (onAudioRecorded) {
            await onAudioRecorded(audioBlob);
          }
          setStatus('idle');
        } catch {
          setStatus('idle');
        }
      };

      mediaRecorder.start(250);
      setStatus('recording');

      // Countdown / Elapsed timer
      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev + 1 >= maxDurationSeconds) {
            stopRecording();
            return maxDurationSeconds;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setErrorKey('vacancyGenerator.micPermissionDenied');
      onError?.('vacancyGenerator.micPermissionDenied');
      setStatus('error');
      stopTracks();
    }
  }, [maxDurationSeconds, maxSizeBytes, onAudioRecorded, onError, stopRecording, stopTracks]);

  useEffect(() => {
    return () => {
      clearTimer();
      stopTracks();
    };
  }, [clearTimer, stopTracks]);

  return {
    status,
    setStatus,
    duration,
    errorKey,
    startRecording,
    stopRecording,
    cancelRecording,
    isRecording: status === 'recording',
    isTranscribing: status === 'transcribing',
  };
}
