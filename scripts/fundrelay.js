#!/usr/bin/env node
const Web3 = require('web3')

const promisify = require("util").promisify

const request = promisify(require("request"))

const irelayhub = require( '../src/js/relayclient/IRelayHub')

const testutils = require('../test/testutils');

const FUND_AMOUNT = 1;
const STAKE_AMOUNT = 0.05;

async function fundrelay(hubaddr, relayaddr, fromaddr, fund, stake, unstakeDelay, web3) {
    let rhub = new web3.eth.Contract(irelayhub, hubaddr)
    let curstake = (await rhub.methods.getRelay(relayaddr).call()).totalStake;

    if ( curstake > 1e18 ) {
        console.log( "already has a stake of "+(curstake/1e18)+" eth. NOT adding more")
    } else {
        console.log( "staking ",stake)

        let gasLimit = 8000000;
        if (await testutils.isRsk(web3)) {
            gasLimit = 6000000;
        }

        console.log( await rhub.methods.stake(relayaddr, unstakeDelay).send(testutils.buildTxParameters({value: stake, from:fromaddr, gas: gasLimit})))
    }

    let balance = await web3.eth.getBalance(relayaddr)
    if ( balance > 1e17 ) {
        console.log( "already has a balance of "+(stake/1e18)+" eth. NOT adding more")
    } else {
        ret = await new Promise((resolve,reject)=> {
            web3.eth.sendTransaction({from: fromaddr, to: relayaddr,value:fund, gas: 1e6}, (e, r) => {
                if (e) reject(e)
                else resolve(r)
            })
        })
        console.log(ret)
    }

}

async function run() {
    let hubaddr = process.argv[2]
    let relay = process.argv[3]
    let ethNodeUrl = process.argv[5] || 'http://localhost:8545'

    console.log({relay, hubaddr, ethNodeUrl})
    if (relay.indexOf("http") == 0) {
        res = await request(relay+"/getaddr")
        relay = JSON.parse(res.body).RelayServerAddress
    }

    let fromaccount = process.argv[4] || 0

    if (!relay) {
        console.log("usage: fundrelay.js {hubaddr} {relayaddr/url} {from-account}")
        console.log(`stake amount is fixed on ${STAKE_AMOUNT} eth, fund amount is fixed on ${FUND_AMOUNT} delay 30 seconds`)
        process.exit(1)
    }

    const web3 = new Web3(new Web3.providers.HttpProvider(ethNodeUrl))

    let accounts = await web3.eth.getAccounts()
    fundrelay(hubaddr, relay, accounts[fromaccount], FUND_AMOUNT*1e18, STAKE_AMOUNT*1e18, 3600 * 24 * 7, web3)

}

run()
