/* eslint-disable no-var */
var path = require('path')
var webpack = require('webpack')

module.exports = {
  entry: [
    'webpack-dev-server/client?http://0.0.0.0:8080',
    'webpack/hot/only-dev-server',
    './examples/index',
  ],
  devServer: {
    contentBase: './examples/',
  },
  devtool: 'eval',
  debug: true,
  output: {
    path: path.join(__dirname, 'examples'),
    filename: 'bundle.js',
  },
  resolveLoader: {
    modulesDirectories: ['node_modules'],
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NoErrorsPlugin(),
    new webpack.IgnorePlugin(/un~$/),
  ],
  resolve: {
    extensions: ['', '.js'],
  },
  module: {
    loaders: [
      { test: /\.css$/, loaders: ['style', 'css'] },
      { test: /\.js$/, loader: 'babel?presets[]=babel-preset-react-hmre' },
    ],
  },
}
