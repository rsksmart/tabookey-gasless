#!/bin/bash

npx webpack-dev-server --context src/js/demo/ --config src/js/demo/webpack.config.js --content-base src/js/demo/public/ --host 0.0.0.0
