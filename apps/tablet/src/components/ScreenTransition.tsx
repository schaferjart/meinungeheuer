import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ScreenTransitionProps {
  /** The key changes whenever the active screen changes — triggers a new fade cycle. */
  screenKey: string;
  children: ReactNode;
}

/**
 * Wraps a screen in a CSS opacity fade.
 * When `screenKey` changes the component mounts fresh (React key remount),
 * starting at opacity-0 and immediately transitioning to opacity-100.
 */
export function ScreenTransition({ screenKey, children }: ScreenTransitionProps) {
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Start hidden, then trigger the fade-in on the next paint.
    setVisible(false);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        setVisible(true);
      });
    });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [screenKey]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease',
        width: '100%',
        height: '100%',
        position: 'absolute',
        inset: 0,
      }}
    >
      {children}
    </div>
  );
}
