/** Explicit safety boundary for the local provider fixture, never a live provider. */
export function syntheticModeEnabled(): boolean {
  if (process.env.AGENCY_TEST_MODE !== 'true') {
    return false;
  }
  if (process.env.AGENCY_TEST_ACK !== 'LOCAL_SYNTHETIC_ONLY') {
    throw new Error('Synthetic mode requires the local-only acknowledgment');
  }
  const database = new URL(process.env.DATABASE_URL || '');
  if (
    database.pathname !== '/postiz_agency_test' ||
    !['localhost', '127.0.0.1', 'postgres'].includes(database.hostname)
  ) {
    throw new Error('Synthetic mode requires the isolated local test database');
  }
  return true;
}

export function requireSyntheticMode(): void {
  if (!syntheticModeEnabled()) {
    throw new Error('Synthetic provider is disabled outside explicit local test mode');
  }
}
