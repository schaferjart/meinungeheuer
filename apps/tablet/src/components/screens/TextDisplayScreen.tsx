import { useCallback } from 'react';
import type { InstallationAction } from '../../hooks/useInstallationMachine';
import { TextReader } from '../TextReader';

interface TextDisplayScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  contextText: string | null;
  language: 'de' | 'en';
}

const FALLBACK_TEXT =
  `# 2024-10-28, 2130h
I am in the bus, I have been the last twelve and a half hours at school.
That's not bragging. That's sad.
As I said, I am in the bus.
Bus No 32 - to "Strassenverkehrsamt", traversing Langstrasse, districts 5, 4 and 3.

Today, as it happens from time to time, I contemplated my distorted sense of reality.
To me, my lack of beliefs, of principle, of truths, are - or so I ~~believe~~ think, a driver for creativity.

I had this thought a while ago, that it is ironic / beautiful that as someone who constantly questions reality, I do architecture, changing space in time.

So, today my thinking and theory is, that since hard truths come with consequences, and as someone-who-is-afraid-of-consequences-although-enjoys-taking-risks, that believing in something bigger is an unpleasant constant (reality rotates around me, after all, not some imaginary creator. (This is no blasphemy but an egotrip. Or a mental condition.)

I will simplify things, and call this mental condition, on a tangible layer, "creativity".

Therefore, I wonder.
I wonder, if "creative people" are:
1. "Creative" because they cannot accept consequences, hide from consequences of reality in imaginary worlds.
2. Less inclined to be religious
3. ~~The best hope for humanity.~~ Yes.
4. If everything that goes wrong on this earth is related to architecture. Yes, according to some. But this is not a serious question. I need to put down even my most silly thoughts otherwise this writing stuff is only half as fun.

The first two are interesting.
But inside.
A deeper truth.

Fear of death.
The end of everything.

Another one(s):
5. Are creative people more inclined to be egocentric, egoistic, assholes? (After all, the world around them does not really exist. And there is no god to judge them later. Or anyway, they cannot accept this idea because it would mean that they would have to justify there misdoings sometime.)
6. Am I using "Creative" as a slur for "people-like-me"?
7. Why am I so angry?
8. Am I actually angry?
9. Why am I writing all this? Probably I have something important to do and I am procrastinating. So what is it?

(Actually, I revised that text after I came to the conclusion below that I should now meditate, at least, I get a sense of how this stupid, sometimes not so stupid machine works.)

Okay, last one:
1. Am I just hating on people with more money? That are doing "normal shit"?`;

export function TextDisplayScreen({ dispatch, contextText, language }: TextDisplayScreenProps) {
  const displayText = contextText ?? FALLBACK_TEXT;

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
