import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface ConsentScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  language: 'de' | 'en';
}

const COPY = {
  de: {
    heading: 'Bevor wir beginnen',
    body: 'Deine Stimme wird aufgenommen und kann verwendet werden, um den nächsten Besucher zu begrüßen.',
    subtext: 'Du nimmst an einer Kette teil — jeder hinterlässt etwas für den nächsten.',
    accept: 'Einverstanden',
    decline: 'Lieber nicht',
  },
  en: {
    heading: 'Before we begin',
    body: 'Your voice will be recorded and may be used to greet the next visitor.',
    subtext: 'You become part of a chain — each person leaves something behind for the next.',
    accept: 'I agree',
    decline: 'No thanks',
  },
} as const;

export function ConsentScreen({ dispatch, language }: ConsentScreenProps) {
  const copy = COPY[language];

  function handleAccept() {
    dispatch({ type: 'CONSENT_ACCEPTED' });
  }

  function handleDecline() {
    dispatch({ type: 'CONSENT_DECLINED' });
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        padding: 'clamp(2rem, 6vw, 5rem)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: '36rem',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(1.5rem, 4vw, 3rem)',
        }}
      >
        {/* Heading */}
        <p
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 'clamp(0.65rem, 1.4vw, 0.85rem)',
            fontWeight: 400,
            color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          {copy.heading}
        </p>

        {/* Main consent statement */}
        <p
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 'clamp(1.4rem, 3.5vw, 2.2rem)',
            fontWeight: 400,
            color: '#ffffff',
            lineHeight: 1.45,
            margin: 0,
          }}
        >
          {copy.body}
        </p>

        {/* Subtext — context about the installation */}
        <p
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 'clamp(0.9rem, 2vw, 1.15rem)',
            fontWeight: 400,
            color: 'rgba(255,255,255,0.5)',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {copy.subtext}
        </p>

        {/* Button row */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '1.5rem',
            marginTop: 'clamp(0.5rem, 2vw, 1.5rem)',
            alignItems: 'center',
          }}
        >
          {/* Accept — primary action, has border */}
          <button
            onClick={handleAccept}
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 'clamp(0.85rem, 1.8vw, 1rem)',
              fontWeight: 400,
              color: '#ffffff',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.6)',
              padding: 'clamp(0.6rem, 1.5vw, 0.85rem) clamp(1.5rem, 4vw, 2.5rem)',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              transition: 'border-color 0.2s ease, color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#ffffff';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.6)';
            }}
          >
            {copy.accept}
          </button>

          {/* Decline — secondary action, no border */}
          <button
            onClick={handleDecline}
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 'clamp(0.85rem, 1.8vw, 1rem)',
              fontWeight: 400,
              color: 'rgba(255,255,255,0.45)',
              background: 'transparent',
              border: 'none',
              padding: 'clamp(0.6rem, 1.5vw, 0.85rem) 0',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.75)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)';
            }}
          >
            {copy.decline}
          </button>
        </div>
      </div>
    </div>
  );
}
