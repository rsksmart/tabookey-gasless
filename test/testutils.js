/* global web3 assert */

const child_process = require('child_process')
const HttpWrapper = require("../src/js/relayclient/HttpWrapper")
const localhostOne = "http://localhost:8090"
const ethUtils = require('ethereumjs-util');
const ethJsTx = require('ethereumjs-tx');

const zeroAddr = "0".repeat(40);

const RSK_VERSION_PREFIX = 'RskJ/'

let _isRsk = null;

const isRsk = async function() {
    if (_isRsk == null) {
        const nodeInfo = await web3.eth.getNodeInfo();
        _isRsk = nodeInfo.startsWith(RSK_VERSION_PREFIX);
    }
    return _isRsk;
};

const sleep = function (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};

const buildTxParameters = (parameters) => {
    if (!_isRsk) {
        return parameters;
    }

    const { gas, gasLimit, ...rest } = parameters;
    return {
        gas: gas || gasLimit,
        ...rest
    };
};

module.exports = {

    //start a background relay process.
    // rhub - relay hub contract
    //options:
    //  verbose: enable background process logging.
    //  stake, delay, txfee, url, relayOwner: parameters to pass to register_new_relay, to stake and register it.
    //
    startRelay: async function (rhub, options) {
        let server = __dirname + "/../build/server/bin/RelayHttpServer"

        options = options || {}
        let args = []
        args.push("-Workdir", "./build/server")
        args.push("-ShortSleep")
        if (rhub) {
            args.push("-RelayHubAddress", rhub.address)
        }
        if (options.EthereumNodeUrl) {
            args.push("-EthereumNodeUrl", options.EthereumNodeUrl)
        }
        if (options.GasPricePercent) {
            args.push("-GasPricePercent", options.GasPricePercent)
        }
        if (options.txfee) {
            args.push("-Fee", options.txfee)
        }
        let proc = child_process.spawn(server, args)

        let relaylog = function () {
        }
        if (process.env.relaylog)
            relaylog = (msg) => msg.split("\n").forEach(line => console.log("relay-" + proc.pid + "> " + line))

        await new Promise((resolve, reject) => {
            let lastresponse
            let listener = data => {
                let str = data.toString().replace(/\s+$/, "")
                if (str.startsWith('ARIEL')) {
                    console.log(str)
                }
                lastresponse = str
                relaylog(str)
                if (str.indexOf("Listening on port") >= 0) {
                    proc.alreadystarted = 1
                    resolve(proc)
                }
            };
            proc.stdout.on('data', listener)
            proc.stderr.on('data', listener)
            let doaListener = (code) => {
                if (!this.alreadystarted) {
                    relaylog("died before init code=" + code)
                    reject(lastresponse)
                }
            };
            proc.on('exit', doaListener.bind(proc))
        })

        let res
        let http = new HttpWrapper()
        let count1 = 3
        while (count1-- > 0) {
            try {
                res = await http.sendPromise(localhostOne + '/getaddr')
                if (res) break
            } catch (e) {
                console.log("startRelay getaddr error", e)
            }
            console.log("sleep before cont.")
            await module.exports.sleep(1000)
        }
        assert.ok(res, "can't ping server")
        let relayServerAddress = res.RelayServerAddress
        console.log("Relay Server Address", relayServerAddress)
        await web3.eth.sendTransaction({
            to: relayServerAddress,
            from: options.relayOwner,
            value: web3.utils.toWei("2", "ether")
        })
        await rhub.stake(relayServerAddress, options.delay || 3600, {from: options.relayOwner, value: options.stake})

        //now ping server until it "sees" the stake and funding, and gets "ready"
        res = ""
        let count = 25
        while (count-- > 0) {
            res = await http.sendPromise(localhostOne + '/getaddr')
            if (res && res.Ready) break;
            await module.exports.sleep(1500)
        }
        assert.ok(res.Ready, "Timed out waiting for relay to get staked and registered")

        return proc

    },

    sleep,

    stopRelay: function (proc) {
        proc && proc.kill()
    },


    register_new_relay: async function (relayHub, stake, delay, txFee, url, relayAccount, ownerAccount) {
        await relayHub.stake(relayAccount, delay, {from: ownerAccount, value: stake})
        return await relayHub.registerRelay(txFee, url, {from: relayAccount})
    },

    register_new_relay_with_privkey: async function (relayHub, stake, delay, txFee, url, ownerAccount, web3, privKey) {
        let address = "0x" + ethUtils.privateToAddress(privKey).toString('hex')
        await relayHub.stake(address, delay, {from: ownerAccount, value: stake})
        await web3.eth.sendTransaction({to: address, from: ownerAccount, value: web3.utils.toWei("1", "ether")})
        let nonce = await web3.eth.getTransactionCount(address)
        let register_data = relayHub.contract.methods.registerRelay(txFee, url).encodeABI()
        let validTransaction = new ethJsTx(buildTxParameters({
            nonce: nonce,
            gasPrice: 1,
            gasLimit: 1000000,
            to: relayHub.address,
            value: 0,
            data: register_data,
        }));
        validTransaction.sign(privKey)
        var raw_tx = '0x' + validTransaction.serialize().toString('hex');

        return web3.eth.sendSignedTransaction(raw_tx).once('transactionHash', (txHash) => {
            console.log("register_new_relay_with_privkey", txHash)
        });
    },

    increaseTime: function (time) {
        return new Promise((resolve, reject) => {
            web3.currentProvider.send({
                jsonrpc: '2.0',
                method: 'evm_increaseTime',
                params: [time],
                id: new Date().getSeconds()
            }, (err) => {
                if (err) return reject(err)
                module.exports.evmMine()
                    .then(r => resolve(r))
                    .catch(e => reject(e))

            });
        })
    },
    evmMine: function () {
        return new Promise((resolve, reject) => {
            web3.currentProvider.send({
                jsonrpc: '2.0',
                method: 'evm_mine',
                params: [],
                id: new Date().getSeconds()
            }, (e, r) => {
                if (e) reject(e)
                else resolve(r)
            });

        })
    },

    /**
     * If ganache is run without '-b' parameter, reverted transaction return
     * error message instantly. Otherwise, revert will only occur once 'evm_mine'
     * is executed, and the error will be generated by truffle.
     *
     * @param {*} error - returned by web3 from RPC call
     * @param {*} errorMessage - expected error message
     */
    assertErrorMessageCorrect: function (error, errorMessage) {
        let blocktime_mode_error = "does not trigger a Solidity `revert` statement"
        if (!error || !error.message) {
            console.log("no error: ", error, "expected:", errorMessage)
            assert.equals(errorMessage, error) //expected some error, got null
        }
        if (error.message.includes(errorMessage) || error.message.includes(blocktime_mode_error))
            return true;
        console.log("invalid error message: " + error.message + "\n(expected: " + errorMessage + ")")
        assert.ok(false, "invalid error message: " + error.message + "\n(expected: " + errorMessage + ")")
    },

    isRsk,

    buildTxParameters,

    waitBlocks: async (numBlocks, sleepMs) => {
        sleepMs = sleepMs || 100;
        const initialBlock = await web3.eth.getBlockNumber();
        for (;;) {
            await sleep(sleepMs);
            const currentBlock = await web3.eth.getBlockNumber();
            if (currentBlock >= (initialBlock + numBlocks)) {
                break;
            }
        }
    },

    init: async () => {
        await isRsk();
    },

    zeroAddr
}
