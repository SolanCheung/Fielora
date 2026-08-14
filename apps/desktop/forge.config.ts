import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { mainConfig } from './webpack.main';
import { rendererConfig } from './webpack.renderer';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'Fielora',
    name: 'Fielora',
    icon: path.resolve(__dirname, 'assets', 'fielora.ico'),
    extraResource: ['../../target/release/fielora-core.exe'],
    electronZipDir: process.env.FIELORA_ELECTRON_ZIP_DIR || undefined,
  },
  rebuildConfig: {},
  makers: [new MakerZIP({})],
  plugins: [
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/renderer/index.html',
            js: './src/renderer/index.tsx',
            name: 'main_window',
            preload: { js: './src/preload.ts' },
          },
        ],
      },
    }),
  ],
};

export default config;
