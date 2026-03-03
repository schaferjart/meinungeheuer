import { useReducer, useCallback } from 'react';
import { installationReducer, INITIAL_STATE } from '@meinungeheuer/core';
import type { InstallationState, InstallationAction } from '@meinungeheuer/core';
export type { InstallationState, InstallationAction };

export function useInstallationMachine(overrideInitial?: Partial<InstallationState>) {
  const [state, dispatch] = useReducer(
    installationReducer,
    overrideInitial ? { ...INITIAL_STATE, ...overrideInitial } : INITIAL_STATE,
  );

  const wake = useCallback(() => dispatch({ type: 'WAKE' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return { state, dispatch, wake, reset };
}
