import path from 'node:path';

const PRODUCT_PROFILE_DIRECTORY = 'desktop-foundation';

export function desktopFoundationUserDataPath(appDataRoot: string): string {
  return path.join(appDataRoot, '@fielora', PRODUCT_PROFILE_DIRECTORY);
}

export function hasExplicitUserDataDirectory(argv: readonly string[]): boolean {
  return argv.some((argument) => argument === '--user-data-dir' || argument.startsWith('--user-data-dir='));
}
