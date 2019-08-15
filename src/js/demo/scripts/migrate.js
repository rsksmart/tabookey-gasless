const truffleConfig = require('../../../../truffle.js');
var RelayHub = artifacts.require("./RelayHub.sol");
var Counter = artifacts.require("./Counter.sol");

module.exports = async function(callback) {
    const network = process.argv[process.argv.length-1];
    const networkConfig = truffleConfig.networks[network];
    const host = `http://${networkConfig.host}:${networkConfig.port}`;
    const relayHub = await RelayHub.new();
    const counter = await Counter.new(relayHub.address);

    console.log('Node RPC host -', host);
    console.log('RelayHub address -', relayHub.address);
    console.log('Counter address -', counter.address);

    callback();
};
