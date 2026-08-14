import type { Configuration } from 'webpack';

export const rendererConfig: Configuration = {
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader', options: { transpileOnly: true } }],
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      {
        test: /\.svg$/i,
        type: 'asset/resource',
        generator: { filename: 'main_window/assets/[name][ext]' },
      },
    ],
  },
  resolve: { extensions: ['.js', '.ts', '.tsx'] },
  target: 'web',
};
