const path = require('path')

module.exports = {
    entry: './app/app.js',
    mode: 'development',
    output: {
        path: path.resolve(__dirname, 'public'),
        filename: 'app.js'
    },
    devtool: 'source-map',
}
