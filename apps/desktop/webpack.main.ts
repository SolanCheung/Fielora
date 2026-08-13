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
  resolve: { extensions: ['.js', '.ts', '.tsx'] },
  target: 'electron-main',
};
