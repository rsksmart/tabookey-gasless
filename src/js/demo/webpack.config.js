const path = require('path')

module.exports = {
    entry: './app/app.js',
    mode: 'development',
    output: {
        path: path.resolve(__dirname, 'public'),
        filename: 'app.js'
    },
    // plugins: [
    //     // Copy our app's index.html and app.css to the build folder.
    //     new CopyWebpackPlugin([{
    //         from: './app/index.html',
    //         to: 'index.html'
    //     }, {
    //         from: './app/styles/app.css',
    //         to: 'app.css'
    //     }])
    // ],
    devtool: 'source-map',
}
