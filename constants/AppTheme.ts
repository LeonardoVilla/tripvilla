import { Platform } from 'react-native';

export const TEAL = '#1f7a6f';
export const BG = '#eaf4f2';

export const shadowCard = Platform.select({
  web: { boxShadow: '0 1px 4px rgba(0,0,0,0.07)' } as any,
  ios: { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  default: { elevation: 2 },
});

export const shadowMenu = Platform.select({
  web: { boxShadow: '0 4px 8px rgba(0,0,0,0.15)' } as any,
  ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8 },
  default: { elevation: 8 },
});

export const shadowFab = Platform.select({
  web: { boxShadow: '0 2px 6px rgba(0,0,0,0.2)' } as any,
  ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  default: { elevation: 4 },
});
