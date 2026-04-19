import { FONT_FAMILY } from '@denkfink/installation-core';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface ConsentScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  language: 'de' | 'en';
}

export function ConsentScreen({ dispatch }: ConsentScreenProps) {
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
        animation: 'consentFadeIn 1.5s ease forwards',
        opacity: 0,
      }}
    >
      <div
        style={{
          maxWidth: '38rem',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(2rem, 5vw, 3.5rem)',
        }}
      >
        {/* Main statement */}
        <p
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 'clamp(1.3rem, 3vw, 2rem)',
            fontWeight: 400,
            color: '#ffffff',
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          This technology will distort your sense of reality. It was used to
          convince you, it will be used again to mimic you. It won&apos;t
          disappear. Contrary to the real world, where anything you do not hide
          can and will be weaponised, here, your contribution will be deleted
          eventually.
        </p>

        {/* Button row */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '1.5rem',
            alignItems: 'center',
          }}
        >
          {/* Consent — primary action, bordered */}
          <button
            onClick={handleAccept}
            style={{
              fontFamily: FONT_FAMILY,
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
            Consent
          </button>

          {/* Do Not Consent — secondary, no border, faded */}
          <button
            onClick={handleDecline}
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: 'clamp(0.85rem, 1.8vw, 1rem)',
              fontWeight: 400,
              color: 'rgba(255,255,255,0.35)',
              background: 'transparent',
              border: 'none',
              padding: 'clamp(0.6rem, 1.5vw, 0.85rem) 0',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.65)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.35)';
            }}
          >
            Do Not Consent
          </button>
        </div>
      </div>

      <style>{`
        @keyframes consentFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
