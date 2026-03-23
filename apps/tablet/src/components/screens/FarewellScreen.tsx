import { useEffect } from 'react';
import { TIMERS } from '@meinungeheuer/shared';
import type { Definition } from '@meinungeheuer/shared';
import type { InstallationAction } from '../../hooks/useInstallationMachine';

interface FarewellScreenProps {
  dispatch: React.Dispatch<InstallationAction>;
  language: 'de' | 'en';
  definition: Definition | null;
}

export function FarewellScreen({ dispatch }: FarewellScreenProps) {
  useEffect(() => {
    const id = setTimeout(() => {
      dispatch({ type: 'TIMER_15S' });
    }, TIMERS.FAREWELL_DURATION_MS);
    return () => clearTimeout(id);
  }, [dispatch]);

  return (
    <div className="w-full h-full bg-black select-none" />
  );
}
