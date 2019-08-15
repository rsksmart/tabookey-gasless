#!/bin/bash -e

PORT=2222
RPC_HOST=http://localhost:4444

if [ "$1" == "help" ]; then

echo Usage:
echo "  $0 - start HttpRelayServer and Counter demo web app"
exit 1

else
	echo "use '$0 help' for usage."
fi

function onexit() {
	echo onexit
	pkill -f RelayHttpServer
}

trap onexit EXIT

dir=`dirname $0`
root=`cd $dir;pwd`

cd $root
gobin=$root/build/server/bin/
export GOPATH=$root/server/:$root/build/server
echo "Using GOPATH=" $GOPATH
./scripts/extract_abi.js
make -C server

pkill -f RelayHttpServer && echo kill old relayserver

migration=`npx truffle exec src/js/demo/scripts/migrate.js --network rsk | tee /dev/stderr` # | grep -A 4 "RelayHub" | grep "contract address" | grep "0x.*" -o`
relayhubaddress=`echo $migration | grep -o "RelayHub address - 0x[0-9A-Fa-f]*" | grep -o "0x.*"`
counteraddress=`echo $migration | grep -o "Counter address - 0x[0-9A-Fa-f]*" | grep -o "0x.*"`
noderpc=`echo $migration | grep -o "Node RPC host - http://[^ ]*" | grep -o "http://.*"`

localhost=`ip a | grep eth | grep -o 'inet \([0-9]\{0,3\}\.\)\{3\}[0-9]\{0,3\}' | grep -o [0-9].*`

cd $root/src/js/demo
echo "{ \"rpcHost\": \"$RPC_HOST\", \"contractAddress\": \"$counteraddress\" }" > app/config.json
npx webpack-cli --config webpack.config.js
cd $root

if [ -z "$relayhubaddress" ]; then
echo "FATAL: failed to detect RelayHub address"
exit 1
fi

if [ -z "$counteraddress" ]; then
echo "FATAL: failed to detect Counter address"
exit 1
fi

# TODO: fund relay and counter contract

relayurl=http://$localhost:$PORT

startrelay="$gobin/RelayHttpServer --Url $relayurl --Port $PORT --RelayHubAddress $relayhubaddress --EthereumNodeUrl $noderpc --Workdir $root/build/server"

$startrelay > /dev/null 2> /dev/null &

sleep 1

./scripts/fundrelay.js $relayhubaddress $relayurl 0 $noderpc
./scripts/fundcontract.js $relayhubaddress $counteraddress 0 $noderpc

npx serve $root/src/js/demo/public

exit 0
