const path = require('path')
const slsw = require('serverless-webpack')

module.exports = {
  entry: slsw.lib.entries,
  mode: 'development',
  target: 'node',
  resolve: {
    extensions: [
      '.js',
      '.json',
      '.ts',
      '.tsx',
    ],
  },
  output: {
    libraryTarget: 'commonjs',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
        use: [
          {
            loader: 'ts-loader',
          },
        ],
      },
      {
        type: 'javascript/auto',
        test: /\.mjs$/,
        use: []
      },
      {
        test: /\.(mp4)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              // outputPath: 'videos',
              name: '[path][name].[ext]'
            }
          }
        ]
      }
    ],
  },
}
