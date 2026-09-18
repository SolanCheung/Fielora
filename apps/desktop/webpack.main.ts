import type { Configuration } from 'webpack';

export const mainConfig: Configuration = {
  entry: './src/main.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader', options: { transpileOnly: true } }],
      },
    ],
  },
  // TypeScript rewrites explicit .ts imports for runtime output; resolve their
  // source modules while bundling, as well as ordinary JavaScript dependencies.
  resolve: { extensions: ['.js', '.ts', '.tsx'], extensionAlias: { '.js': ['.js', '.ts', '.tsx'] } },
  target: 'electron-main',
};
