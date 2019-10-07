/* global web3 contract it before after artifacts describe beforeEach afterEach */
const assert = require('chai').use(require('chai-as-promised')).assert;
const ServerHelper = require('../src/js/relayclient/ServerHelper');
const HttpWrapper = require('../src/js/relayclient/HttpWrapper');
const testutils = require('./testutils')
const register_new_relay = testutils.register_new_relay;
const increaseTime = testutils.increaseTime;

const RelayHub = artifacts.require("./RelayHub.sol");

const localhostOne = "http://localhost:8090"
const gasPricePercent = 20

//ServerHelper adds "noise" to shuffle requests with the same score.
// this will prevent this randomness, to make tests deterministic.
const noRandomness= ()=>0

contract('ServerHelper', function (accounts) {
    let minStake = 1.5e18
    let minDelay = 3600 * 24 * 10
    let httpWrapper = new HttpWrapper()
    let serverHelper = new ServerHelper(httpWrapper, {}, { minStake, minDelay, verbose: false, addScoreRandomness : noRandomness})
    let rhub
    let relayproc

    before(async function() {
        rhub = await RelayHub.deployed()
        relayproc = await testutils.startRelay(rhub, {
            verbose: process.env.relaylog,
            stake: 2e18, delay: 3600 * 24 * 10, txfee: 12, url: "asd", relayOwner: accounts[0], EthereumNodeUrl: web3.currentProvider.host,GasPricePercent:gasPricePercent})
        serverHelper.setHub(rhub)
    })

    after(async function () {
        await testutils.stopRelay(relayproc)
    })

    describe('with running relay hub', function () {
        // Note: a real relay server is not registered in this context
        before('registering relays', async function () {
            const isRsk = await testutils.isRsk();
            // unstake delay too low
            await register_new_relay(rhub, 2e18, 3600 * 24 * 7, 20, "https://abcd1.com", accounts[7], accounts[0]);
            // unregistered
            await register_new_relay(rhub, 2e18, 3600 * 24 * 7 * 2, 2, "https://abcd2.com", accounts[2], accounts[0]);
            // stake too low
            await register_new_relay(rhub, 1e18, 3600 * 24 * 7 * 2, 20, "https://abcd3.com", accounts[3], accounts[0]);

            // Added, removed, added again - go figure.
            // 2 x will not ping

            // Cannot use evm_increaseTime on an RSK node, therefore we don't
            // add and remove "http://abcd4.com" since later we will not be able
            // to unstake it and therefore add a new relay with the same owner
            if (!isRsk) {
                await register_new_relay(rhub, 2e18, 3600 * 24 * 7 * 2, 15, "https://abcd4.com", accounts[4], accounts[0]);
                await rhub.removeRelayByOwner(accounts[4], { from: accounts[0] });
                await increaseTime(3600 * 24 * 7 * 2);
                await rhub.unstake(accounts[4],{ from: accounts[0] });
            }
            await register_new_relay(rhub, 2e18, 3600 * 24 * 7 * 2, 15, "go_resolve_this_address", accounts[4], accounts[0]);

            await register_new_relay(rhub, 2e18, 3600 * 24 * 7 * 2, 30, "https://abcd4.com", accounts[5], accounts[0]);

            await rhub.removeRelayByOwner(accounts[2], { from: accounts[0] });

            // Same as before for an RSK node, but in this case
            // we can remove the relay so that it won't show as
            // registered with the server helper, even though we cannot
            // unstake (and don't really need to for this test case).
            if (!isRsk) {
                await increaseTime(3600 * 24 * 7 * 2);
                await rhub.unstake(accounts[2],{ from: accounts[0] });
            }

            serverHelper.setHub(rhub);
        });

        it("should list all relays from relay contract", async function () {
            const relays = await serverHelper.fetchRelaysAdded();
            assert.deepEqual(
                relays.map(relay => relay.relayUrl),
                [localhostOne, 'go_resolve_this_address', 'https://abcd4.com']
            );
        });

        it("should discover a relay from the relay contract", async function () {
            let pinger = await serverHelper.newActiveRelayPinger()
            let relay = await pinger.nextRelay()
            assert.equal(localhostOne, relay.relayUrl);
        });
    });

    describe('with mock http wrapper', function () {
        //mock for HttpWrapper: instead of sending any ping, the URL is expected to be a json. (ignoring the "getaddr" suffix)
        // if it contains "error", then return it as error. otherwise, its the http send response.
        class MockHttpWrapper {
            constructor() {
                this.pinged=0
            }

            send(url, jsonRequestData, callback) {

                let relayInfo = JSON.parse(url.replace(/\/\w+$/,''))

                this.pinged++

                if (relayInfo.error) {
                    setTimeout(() => callback(new Error(url), null), 0)
                } else {
                    setTimeout(() => callback(null, relayInfo), 0)
                }
            }
        }

        it( "ActiveRelayPinger should keep trying find a relay after 6 broken (high gas, not ready) relays", async function() {

            let mockRelays = [
                { relayUrl:"url1", error: "failed relay1", stake:1, unstakeDelay:1 },
                { relayUrl:"url2", Ready:false, stake:1, unstakeDelay:1 },
                { relayUrl:"url3", error: "failed relay1", stake:1, unstakeDelay:1 },
                { relayUrl:"url4", MinGasPrice: 1e20, Ready:true, stake:1, unstakeDelay:1 },
                { relayUrl:"url5", MinGasPrice: 1, Ready:true, stake:1, unstakeDelay:1 },
                { relayUrl:"url6", Ready:false, stake:1, unstakeDelay:1 },
                { relayUrl:"url7", MinGasPrice: 1, Ready:true, stake:1, unstakeDelay:1 },
            ]


            mockRelays.forEach(r => r.relayUrl = JSON.stringify(r))

            let mockHttpWrapper = new MockHttpWrapper( mockRelays )

            let pinger = new serverHelper.ActiveRelayPinger(mockRelays, mockHttpWrapper, 100)

            //should skip the bad relays, 3 at a time, and reach relay 5
            let r = await pinger.nextRelay()
            //validate its "url5" that got returned (the other were rejected)
            assert.equal("url5", JSON.parse(r.relayUrl).relayUrl )
            //make sure we totally tried exactly 6 relays (we ping in triplets)
            assert.equal(6, mockHttpWrapper.pinged )

        })
    });

    describe('with mock relay hub', function () {
        // let minStake = 1.5e18
        // let minDelay = 10

        const mockRelayAddedEvents = [
            { relay: '1' },
            { relay: '2' },
            { relay: '3' },
            { relay: '4', unstakeDelay: 3600 * 24 * 7 }, // dropped out by default, below minDelay
            { relay: '5', stake: 1e18, transactionFee: 1e5 }, // dropped out by default, below minStake
            { relay: '6', stake: 3e18, transactionFee: 1e9 },
            { relay: '7', transactionFee: 1e7 },
        ].map(relay => ({
            event: 'RelayAdded',
            returnValues: Object.assign({}, {
                transactionFee: 1e10,
                url: `url-${relay.relay}`,
                stake: 2e18,
                unstakeDelay: 3600 * 24 * 14
            }, relay)
        }));

        beforeEach('set mock relay hub', function () {
            this.originalRelayHub = serverHelper.relayHubInstance;
            this.mockRelayHub = { getPastEvents: () => mockRelayAddedEvents };
            serverHelper.setHub(this.mockRelayHub);
        });

        afterEach('restore original relay hub', function () {
            serverHelper.setHub(this.originalRelayHub);
        });

        it("should use default strategy for filtering and sorting relays", async function() {
            // 4 & 5 are dropped out due low unstakeDelay and stake
            // 7 & 6 go first due to lower transaction fee (1e7 and 1e9, vs 1e10 of the rest)
            const relays = await serverHelper.fetchRelaysAdded();
            assert.deepEqual(relays.map(r => r.address), ['7', '6', '1', '2', '3']);
        });

        it("should not filter relays if minimum values not set", async function() {
            // 4 & 5 are not filtered out since no restrictions on minimum delay or stake are set
            // 5, 7 & 6 go first due to lower transaction fee (1e5, 1e7, and 1e9, vs 1e10 of the rest)
            const customServerHelper = new ServerHelper(httpWrapper, {}, { addScoreRandomness : noRandomness});
            customServerHelper.setHub(this.mockRelayHub);
            const relays = await customServerHelper.fetchRelaysAdded();
            assert.deepEqual(relays.map(r => r.address), ['5', '7', '6', '1', '2', '3', '4']);
        });

        it("should use custom strategy for filtering and sorting relays", async function() {
            // 1, 2, 3, & 4 are filtered out due to the custom strategy of filtering by address (only > 4)
            // 6, 7 & 5 are sorted based on stake (3e18, 2e18 & 1e18 respectively)
            const customServerHelper = new ServerHelper(httpWrapper, {}, {
                relayFilter: (relay) => (relay.address > '4'),
                calculateRelayScore: (r) => r.stake,
                addScoreRandomness: noRandomness
            });
            customServerHelper.setHub(this.mockRelayHub);
            const relays = await customServerHelper.fetchRelaysAdded();
            assert.deepEqual(relays.map(r => r.address), ['6', '7', '5']);
        });

        it("should use randomness to shuffle results with same score", async function() {

            var seed = 2;
            function myRandom() {
                var x = Math.sin(seed++) * 10000;
                return x - Math.floor(x);
            }

            //no randomness: should return them all in order
            const customServerHelper = new ServerHelper(httpWrapper, {}, {
                calculateRelayScore: (r) => r.address > '4' ? 2 : 1,  //2 score levels
                addScoreRandomness: noRandomness
            });
            customServerHelper.setHub(this.mockRelayHub);
            let relays = await customServerHelper.fetchRelaysAdded();
            assert.deepEqual(relays.map(r => r.address), ['5', '6', '7', '1', '2', '3', '4' ] )

            //added randomness: should be shuffled
            customServerHelper.addScoreRandomness = myRandom
            relays = await customServerHelper.fetchRelaysAdded();
            assert.deepEqual(relays.map(r => r.address), [ '6', '7', '5', '4', '2', '1', '3' ] )
        });

        it("should down-score failed relays", async function() {

            let failedRelays={}

            const customServerHelper = new ServerHelper(httpWrapper, failedRelays, {
                addScoreRandomness: noRandomness
            });

            customServerHelper.setHub(this.mockRelayHub);

            let relays = await customServerHelper.fetchRelaysAdded();
            assert.deepEqual(relays.map(r => r.address),  [ '5', '7', '6', '1', '2', '3', '4' ] )

            //recently failed. should be at the end of the list
            failedRelays["url-2"]={ lastError : new Date().getTime()-60 }

            relays = await customServerHelper.fetchRelaysAdded();
            assert.deepEqual(relays.map(r => r.address),  [ '5', '7', '6', '1', '3', '4', '2' ] )

            //failed a long time ago. should return to its normal place (and removed from failed list)
            failedRelays["url-2"]={ lastError : new Date().getTime()-1000*3600 }
            relays = await customServerHelper.fetchRelaysAdded();
            assert.deepEqual(relays.map(r => r.address),  [ '5', '7', '6', '1', '2', '3', '4' ] )

            assert.deepEqual(failedRelays, {})

        });


    });
})
