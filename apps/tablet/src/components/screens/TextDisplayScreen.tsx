import { useCallback } from 'react';
import type { InstallationAction } from '../../hooks/useInstallationMachine';
import { TextReader } from '../TextReader';

interface TextDisplayScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  contextText: string | null;
  language: 'de' | 'en';
}

const FALLBACK_TEXT_DE =
  'Wenn Du etwas wissen willst und es durch Meditation nicht finden kannst, so rathe ich Dir, mein lieber, sinnreicher Freund, mit dem nächsten Bekannten, der dir aufstößt, darüber zu sprechen. Es braucht nicht eben ein scharfdenkender Kopf zu sein, auch meine ich es nicht so, als ob du ihn darum befragen solltest, nein! Vielmehr sollst Du es ihm selber allererst erzählen.';

const FALLBACK_TEXT_EN =
  'If you want to know something and cannot find it through meditation, I advise you, my dear, ingenious friend, to speak about it with the nearest acquaintance who comes your way. It need not be a sharp-thinking person, nor do I mean that you should ask them about it, no! Rather, you should tell them about it yourself first.';

export function TextDisplayScreen({ dispatch, contextText, language }: TextDisplayScreenProps) {
  const fallbackText = language === 'de' ? FALLBACK_TEXT_DE : FALLBACK_TEXT_EN;
  const displayText = contextText ?? fallbackText;

  const voiceId = import.meta.env['VITE_ELEVENLABS_VOICE_ID'] ?? '';
  const apiKey = import.meta.env['VITE_ELEVENLABS_API_KEY'] ?? '';

  const handleComplete = useCallback(() => {
    dispatch({ type: 'READY' });
  }, [dispatch]);

  return (
    <TextReader
      text={displayText}
      voiceId={voiceId}
      apiKey={apiKey}
      language={language}
      onComplete={handleComplete}
    />
  );
}
