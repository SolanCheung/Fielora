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
    extraResource: ['../../target/release/fielora-core.exe'],
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
