#!/bin/bash

./build/server/bin/RelayHttpServer --Url http://172.17.0.2:2222 --Port 2222 --RelayHubAddress 0x7557fcE0BbFAe81a9508FF469D481f2c72a8B5f3 --EthereumNodeUrl http://172.17.0.1:4444 --Workdir ./build/server/
