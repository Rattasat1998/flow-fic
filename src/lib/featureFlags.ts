const parseFlag = (rawValue: string | undefined, defaultValue: boolean): boolean => {
  if (!rawValue) return defaultValue;

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'off') return false;
  return defaultValue;
};

export const FEATURE_FLAGS = {
  branching: parseFlag(process.env.NEXT_PUBLIC_FEATURE_BRANCHING, true),
  discoveryCoreFocus: parseFlag(process.env.NEXT_PUBLIC_FEATURE_DISCOVERY_CORE_FOCUS, true),
} as const;
