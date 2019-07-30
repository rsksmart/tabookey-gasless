const Big = require('big.js')

const SampleRecipient = artifacts.require("./SampleRecipient.sol");
const TestRecipientUtils = artifacts.require("./TestRecipientUtils.sol");

const testutils = require('./testutils')
const utils = require('../src/js/relayclient/utils')

const register_new_relay = testutils.register_new_relay;
const register_new_relay_with_privkey = testutils.register_new_relay_with_privkey;
const increaseTime = testutils.increaseTime;
const assertErrorMessageCorrect = testutils.assertErrorMessageCorrect;
const getTransactionSignature = utils.getTransactionSignature;
const getTransactionHash = utils.getTransactionHash;
const rlp = require('rlp');

const ethUtils = require('ethereumjs-util');
const ethJsTx = require('ethereumjs-tx');
const BigNumber = require('bignumber.js');

const message = "hello world";

const zeroAddr = "0".repeat(40)

let relAcc;

contract('SampleRecipient', function (accounts) {
    // TODO: account with no ether
    var expected_real_sender = accounts[0];

    it("should emit message with msgSender and realSender", async function () {
        let sample = await SampleRecipient.deployed()
        let result = await sample.emitMessage(message);
        let log = result.logs[0];
        let args = log.args;
        assert.equal("SampleRecipientEmitted", log.event);
        assert.equal(args.message, message);
        assert.equal(accounts[0], args.msgSender);
        assert.equal(expected_real_sender, args.realSender);
    });

    it("should allow owner to withdraw balance from RelayHub", async function () {
        let sample = await SampleRecipient.deployed()
        let deposit = new Big("100000000000000000")
        let rhub = await RelayHub.deployed()
        await rhub.depositFor(sample.address, {from: accounts[0], value: deposit})
        let depositActual = await rhub.balanceOf(sample.address)
        assert.equal(deposit.toString(), depositActual.toString())
        let a0_balance_before = await web3.eth.getBalance(accounts[0])
        try {
            await sample.withdraw({from: accounts[2]})
            assert.fail()
        } catch (error) {
            assertErrorMessageCorrect(error, "revert")
        }
        let gasPrice = 1
        let owner = await sample.owner.call()
        let res = await sample.withdraw({from: owner, gasPrice: gasPrice})
        let a0_balance_after = new Big(await web3.eth.getBalance(accounts[0]))
        let expected_balance_after = new Big(a0_balance_before).add(deposit).sub(res.receipt.gasUsed * gasPrice)
        assert.equal(expected_balance_after.toString(), a0_balance_after.toString())
        depositActual = await rhub.balanceOf(sample.address)
        assert.equal("0", depositActual.toString())
    });
});

const RelayHub = artifacts.require("./RelayHub.sol");
contract("RelayHub", function (accounts) {

    assert.ok(web3.version.toString().indexOf("1.0") >= 0, "Must use web3>=1.0 (truffle 5)")

    const GAS_LIMIT_ETH = 8000029;
    const GAS_LIMIT_RSK = 6800000;

    let rhub;
    let sr;

    let transaction;
    let sig;
    let digest;
    let gas_limit_any_value;
    let relayAccount = accounts[1]

    before(async function () {


        rhub = await RelayHub.deployed();
        sr = await SampleRecipient.deployed()
        transaction = await getTransaction(sr);
        digest = await getTransactionHash(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, rhub.address, relayAccount);
        sig = await getTransactionSignature(web3, accounts[0], digest)
        let deposit = 100000000000;
        await sr.deposit({value: deposit});
        await testutils.init();
        gas_limit_any_value = await testutils.isRsk() ? GAS_LIMIT_RSK : GAS_LIMIT_ETH;
    });

    var real_sender = accounts[0];
    var one_ether = web3.utils.toWei('1', 'ether');

    it("should retrieve version number", async function () {
        let version = await rhub.version();
        assert.equal(version, "1.0.0");

    });

    it("test_stake", async function () {
        let ownerAccount = accounts[1];
        let relayAccount = await web3.eth.personal.newAccount("password")
        let zero_stake = await rhub.getRelay(ownerAccount)
        let z = zero_stake.valueOf()[0]
        // assert.equal(0, z);

        let expected_stake = web3.utils.toWei('1', 'ether');
        await rhub.stake(relayAccount, 3600 * 24 * 7, {value: expected_stake, from: ownerAccount})
        let relayData = await rhub.getRelay(relayAccount)
        assert.equal(expected_stake, new Big(relayData.totalStake).sub(z));
        assert.equal(3600 * 24 * 7, relayData.unstakeDelay);
        assert.equal(ownerAccount, relayData.owner);
    })
    it("should allow anyone to deposit for a recipient contract, but not more than 'maximumDeposit'", async function () {
        let sample = await SampleRecipient.deployed()
        let depositBefore = await rhub.balanceOf(sample.address)
        let deposit = new Big("1000000000000000")
        try {
            await rhub.depositFor(sample.address, {from: accounts[0], value: new Big(one_ether).times(3)})
            assert.fail()
        } catch (error) {
            assertErrorMessageCorrect(error, "deposit too big")
        }
        await rhub.depositFor(sample.address, {from: accounts[0], value: deposit})
        let depositActual = await rhub.balanceOf(sample.address)
        let depositExpected = deposit.add(depositBefore)
        assert.equal(depositExpected.toString(), depositActual.toString())
    });

    it("should allow owner to stake on behalf of the relay", async function () {
        let gasless_relay_address = "0x2Dd8C0665327A26D7655055B22c9b3bA596DfeD9"
        let balance_of_gasless_before = await web3.eth.getBalance(gasless_relay_address);
        let balance_of_acc7_before = await web3.eth.getBalance(accounts[7]);
        let expected_stake = web3.utils.toWei('1', 'ether')
        let gasPrice = 1
        let res = await rhub.stake(gasless_relay_address, 3600 * 24 * 7, {
            value: expected_stake,
            gasPrice: gasPrice,
            from: accounts[7]
        })
        let stake = await rhub.getRelay(gasless_relay_address)
        let balance_of_gasless_after = await web3.eth.getBalance(gasless_relay_address);
        let balance_of_acc7_after = new Big(await web3.eth.getBalance(accounts[7]));
        let expected_balance_after = new Big(balance_of_acc7_before).sub(expected_stake).sub(res.receipt.gasUsed * gasPrice)
        assert.equal(balance_of_acc7_after.toString(), expected_balance_after.toString());
        assert.equal(balance_of_gasless_after.toString(), balance_of_gasless_before.toString());
        assert.equal(expected_stake, stake[0]);
    })

    it("should forbid contracts-owned addresses to register as relays", async function () {
        let testutils = await TestRecipientUtils.new()
        try {
            await web3.eth.sendTransaction({from: accounts[0], to: testutils.address, value: 0.6e18})
            await rhub.stake(testutils.address, 3600 * 24 * 7, {value: 1e18})
            await testutils.registerAsRelay(rhub.address);
            assert.fail();
        } catch (error) {
            assertErrorMessageCorrect(error, "Contracts cannot register as relays")
        }
    })

    it("should forbid owners' addresses to register as relays", async function () {
        try {
            await register_new_relay(rhub, one_ether, weekInSec, 120, "hello", accounts[0], accounts[0]);
            assert.fail()
        } catch (error) {
            assertErrorMessageCorrect(error, "relay cannot stake for itself")
        }
    });

    it("should allow externally owned addresses to register as relays", async function () {
        let res = await register_new_relay(rhub, one_ether, weekInSec, 120, "hello", accounts[1], accounts[0]);
        let log = res.logs[0]
        assert.equal("RelayAdded", log.event)
        // assert.equal(two_ether, log.args.stake) changes, depending on position in test list
    });

    async function getTransaction(testContract) {
        return testContract.contract.methods.emitMessage(message).encodeABI()
    }

    let from = real_sender;
    let to = SampleRecipient.address;
    let transaction_fee = 10;
    let gas_price = 10;
    let gas_limit = 1000000;
    // Note: this is not a transaction nonce, this is a RelayHub nonce
    // Note!! Increment each time relay is performed and not reverted!
    let relay_nonce = 0;

    /**
     * Depends on 'test_register_relay'
     */
    it("should get '0' (Success Code) from 'canRelay' for a valid transaction", async function () {
        let canRelay = await rhub.canRelay(relayAccount, from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, "0x");
        assert.equal(0, canRelay.status.valueOf());
    });

    it("should get '1' (Wrong Signature) from 'canRelay' for a transaction with a wrong signature", async function () {
        let wrongSig = "0xaaaa6ad4b4fab03bb2feaea2d54c690206e40036e4baa930760e72479da0cc5575779f9db9ef801e144b5e6af48542107f2f094649334b030e2bb44f054429b451"
        let canRelay = await rhub.canRelay(relayAccount, from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, wrongSig, "0x");
        assert.equal(1, canRelay.status.valueOf());
    });

    it("should get '2' (Wrong Nonce) from 'canRelay' for a transaction with a wrong nonce", async function () {
        let wrongNonce = 777;
        let digest = await getTransactionHash(from, to, transaction, transaction_fee, gas_price, gas_limit, wrongNonce, rhub.address, relayAccount);
        let sig = await getTransactionSignature(web3, accounts[0], digest)
        let canRelay = await rhub.canRelay(relayAccount, from, to, transaction, transaction_fee, gas_price, gas_limit, wrongNonce, sig, "0x");
        assert.equal(2, canRelay.status.valueOf());
    });

    // TODO: gasPrice change flow. As discussed, in case the Relay decides to ACCELERATE mining of tx he ALREADY signed,
    // Relay is allowed to retry the SAME tx with a higher gasPrice without being Penalized.
    // Need to create test for such flow.
    it("should perform the relayed 'send message' method call transaction ", async function () {

        let startBlock = await web3.eth.getBlockNumber()

        assert.equal(relay_nonce, await rhub.getNonce(from) )

        let result = await rhub.relayCall(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, '0x', testutils.buildTxParameters({
            from: relayAccount,
            gasPrice: gas_price,
            gasLimit: gas_limit_any_value
        }));
        relay_nonce++;

        assert.equal(relay_nonce, await rhub.getNonce(from) )

        var log_relayed = result.logs[0];
        var args_relayed = log_relayed.args;
        assert.equal("TransactionRelayed", log_relayed.event);
        assert.equal(args_relayed.selector, sr.contract.methods.emitMessage(message).encodeABI().slice(0, 10));
        assert.equal(0, args_relayed.status.toNumber())
        var logs_messages = await sr.contract.getPastEvents("SampleRecipientEmitted", {
            fromBlock: startBlock,
            toBlock: 'latest'
        });
        assert.equal(1, logs_messages.length)
        let log_message = logs_messages[0];
        var args_message = log_message.returnValues;
        assert.equal("SampleRecipientEmitted", log_message.event);
        assert.equal(message, args_message.message);

        var postevent = await sr.contract.getPastEvents('SampleRecipientPostCall', {
            fromBlock: startBlock,
            toBlock: 'latest'
        })
        assert.equal("SampleRecipientPostCall", postevent[0].event)
        assert.equal(123456, postevent[0].returnValues.preRetVal)
        assert.notEqual(0, postevent[0].returnValues.usedGas)

    });

    it("should perform the relayed method call with no parameters ", async function () {
        await testutils.evmMine()
        let startBlock = await web3.eth.getBlockNumber()
        let transacionNoParams = sr.contract.methods.emitMessageNoParams().encodeABI()
        let digest = await getTransactionHash(from, to, transacionNoParams, transaction_fee, gas_price, gas_limit, relay_nonce, rhub.address, relayAccount);
        let sig = await getTransactionSignature(web3, accounts[0], digest)

        let logs_messages = await sr.contract.getPastEvents("SampleRecipientEmitted", {
            fromBlock: startBlock,
            toBlock: 'latest'
        });
        assert.equal(0, logs_messages.length)
        let result = await rhub.relayCall(from, to, transacionNoParams, transaction_fee, gas_price, gas_limit, relay_nonce, sig, '0x', testutils.buildTxParameters({
            from: relayAccount,
            gasPrice: gas_price,
            gasLimit: gas_limit_any_value
        }));
        relay_nonce++;
        var log_relayed = result.logs[0];
        var args_relayed = log_relayed.args;
        assert.equal("TransactionRelayed", log_relayed.event);
        assert.equal(0, args_relayed.status.toNumber());
        logs_messages = await sr.contract.getPastEvents("SampleRecipientEmitted", {
            fromBlock: startBlock,
            toBlock: 'latest'
        });
        assert.equal(1, logs_messages.length)
        let log_message = logs_messages[0];
        var args_message = log_message.returnValues;
        assert.equal("SampleRecipientEmitted", log_message.event);
        assert.equal("Method with no parameters", args_message.message);
    });

    it("should not accept relay requests from unknown addresses", async function () {
        digest = await getTransactionHash(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, rhub.address, relayAccount);
        sig = await getTransactionSignature(web3, accounts[0], digest)
        try {
            await rhub.relayCall(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, '0x', testutils.buildTxParameters({
                from: accounts[6],
                gasPrice: gas_price,
                gasLimit: gas_limit_any_value
            }));
            assert.fail();
        } catch (error) {
            assertErrorMessageCorrect(error, "Unknown relay")
        }
    });

    it("should not accept relay requests with gas price lower then user specified", async function () {
        try {
            await rhub.relayCall(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, '0x', testutils.buildTxParameters({
                from: relayAccount,
                gasPrice: gas_price - 1,
                gasLimit: gas_limit_any_value
            }));
            assert.fail();
        } catch (error) {
            assertErrorMessageCorrect(error, "Invalid gas price")
        }
    });

    it("should not accept relay requests if destination recipient doesn't approve it", async function () {
        let from = accounts[6];
        let relay_nonce = 0;
        await sr.setBlacklisted(from)
        let digest = await getTransactionHash(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, rhub.address, relayAccount);
        let sig = await getTransactionSignature(web3, from, digest)
        let res = await rhub.relayCall(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, '0x', testutils.buildTxParameters({
            from: relayAccount,
            gasPrice: gas_price,
            gasLimit: gas_limit_any_value
        }));

        assert.equal(res.logs[0].event, "CanRelayFailed")
        let canRelay = await rhub.canRelay(relayAccount, from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, "0x");
        assert.equal(11, canRelay.status.valueOf().toString())
    });

    it("should not accept relay requests if gas limit is too low for a relayed transaction", async function () {
        // Adding gasReserve is not enough by a few wei as some gas is spent before gasleft().
        let gas_reserve = 99999;
        try {
            await rhub.relayCall(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, '0x', {
                from: relayAccount,
                gasPrice: gas_price,
                gas: gas_limit + gas_reserve
            });
            assert.fail();
        } catch (error) {
            assertErrorMessageCorrect(error, "Not enough gasleft");
        }
    });

    it("should not accept relay requests if destination recipient doesn't have a balance to pay for it", async function () {
        await sr.withdraw();
        try {
            await rhub.relayCall(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, '0x', testutils.buildTxParameters({
                from: relayAccount,
                gasPrice: gas_price,
                gasLimit: gas_limit_any_value
            }));
            assert.fail();
        } catch (error) {
            assertErrorMessageCorrect(error, "Recipient balance too low")
        }
    });


    it("should not allow non-owners to remove relay", async function () {
        try {
            await rhub.removeRelayByOwner(relayAccount, {from: accounts[2]});
            assert.fail()
        } catch (error) {
            assertErrorMessageCorrect(error, "not owner")
        }
    });

    it("should not allow owners to unstake if still registered", async function () {
        let canUnstake = await rhub.canUnstake.call(relayAccount);
        assert.equal(canUnstake, false);
        try {
            await rhub.unstake(relayAccount);
            assert.fail()
        } catch (error) {
            assertErrorMessageCorrect(error, "canUnstake failed")
        }
    });

    it("should allow the owner to remove his relay", async function () {
        try {
            await rhub.removeRelayByOwner(zeroAddr)
            assert.fail()
        } catch (error) {
            assertErrorMessageCorrect(error, "not owner")
        }

        let res = await rhub.removeRelayByOwner(relayAccount);
        assert.equal("RelayRemoved", res.logs[0].event);
        assert.equal(relayAccount, res.logs[0].args.relay);
    });

    it("should not allow the owner to unstake unregistered relay's stake before time", async function () {
        const isRsk = await testutils.isRsk();
        relAcc = relayAccount;
        if (isRsk) {
            relAcc = await web3.eth.personal.newAccount('password')
            await web3.eth.personal.unlockAccount(relAcc, 'password')
            await web3.eth.sendTransaction({ from: accounts[0], to: relAcc, value: one_ether });
            let res = await register_new_relay(rhub, one_ether, weekInSec, 120, "hello", relAcc, accounts[0]);
            assert.equal("RelayAdded", res.logs[0].event)
            res = await rhub.removeRelayByOwner(relAcc);
            assert.equal("RelayRemoved", res.logs[0].event);
            assert.equal(relAcc, res.logs[0].args.relay);
        }

        let relay = await rhub.getRelay.call(relAcc);
        assert.equal(false, relay.stake == 0);
        let canUnstake = await rhub.canUnstake.call(relAcc);

        assert.equal(false, canUnstake)
        if (isRsk) {
            await testutils.sleep(1000);
        } else {
            await increaseTime(relay.unstakeDelay / 2)
        }

        canUnstake = await rhub.canUnstake.call(relAcc);
        assert.equal(false, canUnstake)
        try {
            await rhub.unstake(relAcc);
            assert.fail()
        } catch (error) {
            assertErrorMessageCorrect(error, "canUnstake failed")
        }

        if (isRsk) {
            // At the moment we cannot use evm_increaseTime on an RSK node, so all
            // that we can test is that we cannot unstake before time, but
            // not that we can unstake once the unstakeDelay has passed.
            // (the minimum - fixed - unstake delay is one week).
            return;
        }

        await increaseTime(relay.unstakeDelay / 2)
        canUnstake = await rhub.canUnstake.call(relAcc);
        assert.equal(canUnstake, true)
    });

    it("should not allow non-owners to unstake", async function () {
        if (await testutils.isRsk()) {
            // At the moment we cannot use evm_increaseTime on an RSK node, so all
            // that we can test is that we cannot unstake before time, but
            // not that we can unstake once the unstakeDelay has passed.
            // (the minimum - fixed - unstake delay is one week).
            this.skip();
            return;
        }

        let canUnstake = await rhub.canUnstake.call(relAcc);
        assert.equal(true, canUnstake)

        try {
            await rhub.unstake(relAcc, {from: accounts[2]});
            assert.fail()
        } catch (error) {
            assertErrorMessageCorrect(error, "not owner")
        }
    });

    it("should allow the owner to unstake unregistered relay's stake", async function () {
        if (await testutils.isRsk()) {
            // At the moment we cannot use evm_increaseTime on an RSK node, so all
            // that we can test is that we cannot unstake before time, but
            // not that we can unstake once the unstakeDelay has passed.
            // (the minimum - fixed - unstake delay is one week).
            this.skip();
            return;
        }

        let canUnstake = await rhub.canUnstake.call(relAcc);
        assert.equal(true, canUnstake);
        await rhub.unstake(relAcc);

        let stakeAfter = await rhub.getRelay(relAcc);
        assert.equal(0, stakeAfter.totalStake)
    });

    it("should not allow a state to downgrade (possibly a few tests needed)")

    it("should allow to penalize a removed relay")
    it("should not allow to penalize an already penalized relay")

    let dayInSec = 24 * 60 * 60;
    let weekInSec = dayInSec * 7;

    let nonce_any_value = 4;
    let gas_price_any_value = 4;
    let tx_value_any_value = 0;
    let gasPricePenalize = 5;

    let snitching_account;
    let privKey = Buffer.from("cf5de3123d7ee4e0c66761793f1cc258324ecdf677fe3422e4cd0d87b9132322", "hex");
    let data1;
    let data2;
    let transaction1;
    let transaction2;

    let unsignedTransaction1Encoded;
    let unsignedTransaction2Encoded;

    let sig1;
    let sig2;

    function encodeRLP(transaction) {
        return "0x" + rlp.encode(transaction.raw.slice(0, 6)).toString("hex")
    }

    it("should penalize relay for signing two distinct transactions with the same nonce", async function () {
        let address = "0x" + ethUtils.privateToAddress(privKey).toString('hex')
        await register_new_relay_with_privkey(rhub, one_ether, weekInSec, 120, "hello", accounts[0], web3, privKey);
        let stake = await rhub.getRelay(address);
        assert.equal(one_ether, stake[0]);

        data1 = rhub.contract.methods.relayCall(testutils.zeroAddr, testutils.zeroAddr, "0x1", 1, 1, 1, 1, "0x1", "0x").encodeABI()
        data2 = rhub.contract.methods.relayCall(testutils.zeroAddr, testutils.zeroAddr, "0x2", 2, 2, 2, 2, "0x2", "0x").encodeABI()

        transaction1 = new ethJsTx(testutils.buildTxParameters({
            nonce: nonce_any_value,
            gasPrice: gas_price_any_value,
            gasLimit: gas_limit_any_value,
            to: rhub.address,
            value: tx_value_any_value,
            data: data1
        }))
        transaction2 = new ethJsTx(testutils.buildTxParameters({
            nonce: nonce_any_value,
            gasPrice: gas_price_any_value,
            gasLimit: gas_limit_any_value,
            to: rhub.address,
            value: tx_value_any_value,
            data: data2
        }))
        unsignedTransaction1Encoded = encodeRLP(transaction1)
        unsignedTransaction2Encoded = encodeRLP(transaction2)
        let hash1 = "0x" + transaction1.hash(false).toString('hex')
        sig1 = utils.getTransactionSignatureWithKey(privKey, hash1, false)
        assert.equal(sig1.length, 132);
        let hash2 = "0x" + transaction2.hash(false).toString('hex')
        sig2 = utils.getTransactionSignatureWithKey(privKey, hash2, false)
        assert.equal(sig2.length, 132);

        snitching_account = accounts[7];
        let snitching_account_initial_balance = await web3.eth.getBalance(snitching_account);

        let res = await rhub.penalizeRepeatedNonce(unsignedTransaction1Encoded, sig1, unsignedTransaction2Encoded, sig2, testutils.buildTxParameters({
            from: snitching_account,
            gasPrice: gasPricePenalize,
            gasLimit: gas_limit_any_value
        }));

        assert.equal("Penalized", res.logs[1].event)
        assert.equal(address, res.logs[1].args.relay.toLowerCase())
        assert.equal(snitching_account, res.logs[1].args.sender)

        let expected_balance_after_penalize = new Big(snitching_account_initial_balance).add(stake[0]/2).sub(res.receipt.gasUsed * gasPricePenalize);

        assert(expected_balance_after_penalize.eq(new Big(await web3.eth.getBalance(snitching_account))));
    });

    let asyncForEach = async function (array, callback) {
        for (let index = 0; index < array.length; index++) {
            await callback(array[index], index, array);
        }
    }

    it("should penalize relay for calling any non-RelayHub address or a method not whitelisted inside hub", async function () {
        // A call to a method that is not whitelisted for the relay to use
        let data1 = rhub.contract.methods.removeRelayByOwner(testutils.zeroAddr).encodeABI()
        let data2 = sr.contract.methods.emitMessage("Hello SampleRecipient!").encodeABI()
        let illegalTransactions = [{
            data: data1,
            destination: rhub.address
        },
            {
                data: data2,
                destination: sr.address
            }]
        await asyncForEach(illegalTransactions, async function (tx) {
            console.log("will try: " + tx.data.slice(0, 10) + " " + tx.destination)
            await register_new_relay_with_privkey(rhub, one_ether, weekInSec, 120, "hello", accounts[0], web3, privKey);
            let address = "0x" + ethUtils.privateToAddress(privKey).toString('hex')
            let stake = await rhub.getRelay(address);
            assert.equal(one_ether, stake[0]);

            let illegalTransaction = new ethJsTx(testutils.buildTxParameters({
                nonce: nonce_any_value,
                gasPrice: gas_price_any_value,
                gasLimit: gas_limit_any_value,
                to: tx.destination,
                value: tx_value_any_value,
                data: tx.data
            }))

            let snitching_account_initial_balance = await web3.eth.getBalance(snitching_account);

            let unsignedillegalTransactionEncoded = encodeRLP(illegalTransaction)
            let hash = "0x" + illegalTransaction.hash(false).toString('hex')
            let sig = utils.getTransactionSignatureWithKey(privKey, hash, false)
            assert.equal(sig.length, 132);
            let res = await rhub.penalizeIllegalTransaction(unsignedillegalTransactionEncoded, sig, testutils.buildTxParameters({
                from: snitching_account,
                gasPrice: gasPricePenalize,
                gasLimit: gas_limit_any_value
            }));

            assert.equal("Penalized", res.logs[1].event)

            let expected_balance_after_penalize = new Big(snitching_account_initial_balance).add(stake[0]/2).sub(res.receipt.gasUsed * gasPricePenalize);

            assert(expected_balance_after_penalize.eq(new Big(await web3.eth.getBalance(snitching_account))));
        });
    });

    it("should revert an attempt to penalize relay with an allowed transaction ", async function () {
        try {
            await register_new_relay_with_privkey(rhub, one_ether, weekInSec, 120, "hello", accounts[0], web3, privKey);
            await rhub.penalizeIllegalTransaction(unsignedTransaction1Encoded, sig1, testutils.buildTxParameters({
                from: snitching_account,
                gasPrice: gasPricePenalize,
                gasLimit: gas_limit_any_value
            }));
            assert.fail()
        } catch (error) {
            assertErrorMessageCorrect(error, "Legal relay transaction")
        }
    });

    it("should revert an attempt to penalize relay with two identical transactions", async function () {
        try {
            await rhub.penalizeRepeatedNonce(unsignedTransaction1Encoded || "0x", sig1 || "0x", unsignedTransaction1Encoded || "0x", sig1 || "0x", testutils.buildTxParameters({
                from: snitching_account,
                gasPrice: gasPricePenalize,
                gasLimit: gas_limit_any_value
            }));
            assert.fail()
        } catch (error) {
            assertErrorMessageCorrect(error, "tx is equal")
        }
    });

    it("should revert an attempt to penalize relay with two transactions with different nonce", async function () {
        let transaction2_nextNonce = new ethJsTx(transaction2);
        transaction2_nextNonce.nonce = nonce_any_value + 1;

        let unsignedTransaction2Encoded_nextNonce = encodeRLP(transaction2_nextNonce)
        let hash = "0x" + transaction2_nextNonce.hash(false).toString('hex')
        let sig2_nextNonce = utils.getTransactionSignatureWithKey(privKey, hash, false)
        assert.equal(sig2_nextNonce.length, 132);


        try {
            await rhub.penalizeRepeatedNonce(unsignedTransaction1Encoded, sig1, unsignedTransaction2Encoded_nextNonce, sig2_nextNonce, testutils.buildTxParameters({
                from: snitching_account,
                gasPrice: gasPricePenalize,
                gasLimit: gas_limit_any_value
            }));
            assert.fail()
        } catch (error) {
            assertErrorMessageCorrect(error, "Different nonce")
        }
    });

    it("should revert an attempt to penalize relay with two transactions from different relays", async function () {
        await register_new_relay(rhub, one_ether, weekInSec, 120, "hello", accounts[6], accounts[0]);
        let privKeySix = Buffer.from("e485d098507f54e7733a205420dfddbe58db035fa577fc294ebd14db90767a52", "hex");
        let hash = "0x" + transaction2.hash(false).toString('hex')
        let sig2_fromAccountSix = utils.getTransactionSignatureWithKey(privKeySix, hash, false)
        assert.equal(sig2_fromAccountSix.length, 132);

        try {
            await rhub.penalizeRepeatedNonce(unsignedTransaction1Encoded, sig1, unsignedTransaction2Encoded, sig2_fromAccountSix, testutils.buildTxParameters({
                from: snitching_account,
                gasPrice: gasPricePenalize,
                gasLimit: gas_limit_any_value
            }));
            assert.fail()
        } catch (error) {
            assertErrorMessageCorrect(error, "Different signer")
        }
    });

    [0, 1, 3, 5, 10, 50, 100, 200].forEach(requested_fee => {
        //avoid duplicate coverage checks. they do the same, and take a lot of time:
        if ( requested_fee>0 && process.env.MODE=='coverage' ) return
        it("should compensate relay with requested fee of " + requested_fee + "%", async function () {
            /* Now this is stupid... :-( */
            if (requested_fee === 0) {
                if (await testutils.isRsk()) {
                    relAcc = await web3.eth.personal.newAccount('password')
                    await web3.eth.personal.unlockAccount(relAcc, 'password')
                    await web3.eth.sendTransaction({ from: accounts[0], to: relAcc, value: one_ether });
                } else {
                    relAcc = relayAccount;
                }
                // Relay was removed in some previous test, unless skipped
                try {
                    await register_new_relay(rhub, one_ether, weekInSec, 120, "hello", relAcc, accounts[0]);
                } catch (e) {
                    console.log(e)
                }
                // This is required to initialize rhub's balances[acc[0]] value
                // If it is not set, the transacion will cost 15,000 gas more than expected by 'gasOverhead'
                await rhub.depositFor(accounts[0], {value: 1})
            }
            /**/
            let relay_recipient_balance_before = await rhub.balanceOf(sr.address)
            if (relay_recipient_balance_before.toString() == 0) {
                let deposit = 100000000;
                await sr.deposit({value: deposit});
            }
            relay_recipient_balance_before = await rhub.balanceOf(sr.address)
            let relay_balance_before = new Big(await web3.eth.getBalance(relAcc));
            let r = await rhub.getRelay(relAcc)
            let owner = r[3]

            let relay_owner_hub_balance_before = await rhub.balanceOf(owner)


            let digest = await getTransactionHash(from, to, transaction, requested_fee, gas_price, gas_limit, relay_nonce, rhub.address, relAcc);
            let sig = await getTransactionSignature(web3, from, digest)

            assert.equal(0, (await rhub.canRelay(relAcc, from, to, transaction, requested_fee, gas_price, gas_limit, relay_nonce, sig, "0x")).status)

            let res = await rhub.relayCall(from, to, transaction, requested_fee, gas_price, gas_limit, relay_nonce, sig, '0x', testutils.buildTxParameters({
                from: relAcc,
                gasPrice: gas_price,
                gasLimit: gas_limit_any_value
            }));
            relay_nonce++;

            let relay_owner_hub_balance_after = await rhub.balanceOf(owner)
            let relay_balance_after = new Big(await web3.eth.getBalance(relAcc))

            // What is the factor relay is expecting to get paid by. I.e. for 10% it is '1.1'; For 200% it is '3.0'
            let requested_coeff = new BigNumber((requested_fee + 100) / 100).toPrecision(3, BigNumber.ROUND_HALF_UP)

            // Calculate the actual factor. Rounding is expected.
            let revenue = relay_owner_hub_balance_after.sub(relay_owner_hub_balance_before)
            let expenses = relay_balance_before.sub(relay_balance_after)

            if (requested_fee == 0) {
                let gas_diff = expenses.sub(revenue).div(gas_price)
                if (gas_diff != 0) {
                    console.log("== zero-fee unmatched gas. RelayHub.gasOverhead should be increased by: " + gas_diff.toString())
                }
            }

            let received_coeff = new BigNumber(revenue).div(expenses)
            // I don't know how does rounding work for BigNumber, but it seems to be broken to me

            if (received_coeff.lt(1)) {
                received_coeff = received_coeff.toPrecision(2, BigNumber.ROUND_HALF_UP)
            } else {
                received_coeff = received_coeff.toPrecision(3, BigNumber.ROUND_HALF_UP)
            }
            assert.equal(requested_coeff.toString(), received_coeff.toString())

            // Check that relay did pay it's gas fee on itslef.
            let expected_balance_after = relay_balance_before.sub(res.receipt.gasUsed * gas_price)
            assert.equal(expected_balance_after.toString(), relay_balance_after.toString())

            // Check that relay's revenue is deducted from recipient's stake.
            let relay_recipient_balance_after = await rhub.balanceOf(sr.address)
            let expected_recipient_balance = relay_recipient_balance_before - revenue
            assert.equal(expected_recipient_balance.toString(), relay_recipient_balance_after.toString())
        });
    })

    it("should revert relayed call on an attempt to withdraw deposit during relayed transaction", async function () {
        let withdrawDuringRelayedCall = await sr.withdrawDuringRelayedCall();
        assert.equal(withdrawDuringRelayedCall, false);
        try {
            await sr.setWithdrawDuringRelayedCall(true);
            withdrawDuringRelayedCall = await sr.withdrawDuringRelayedCall();
            assert.equal(withdrawDuringRelayedCall, true);

            let digest = await getTransactionHash(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, rhub.address, relAcc);
            let sig = await getTransactionSignature(web3, from, digest);

            assert.equal(0, (await rhub.canRelay(relAcc, from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, "0x")).status);

            let res = await rhub.relayCall(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, '0x', testutils.buildTxParameters({
                from: relAcc,
                gasPrice: gas_price,
                gasLimit: gas_limit_any_value
            }));
            relay_nonce++;
            let RecipientBalanceChanged = 4;
            assert.equal("TransactionRelayed", res.logs[0].event);
            assert.equal(RecipientBalanceChanged, res.logs[0].args.status);
        } finally {
            // returning state to previous one
            await sr.setWithdrawDuringRelayedCall(false);
            withdrawDuringRelayedCall = await sr.withdrawDuringRelayedCall();
            assert.equal(withdrawDuringRelayedCall, false);
        }


    });

    it("should revert an attempt to use more than allowed gas for acceptRelayedCall(50000)", async function () {

        let AcceptRelayedCallReverted = 3;
        let overspendAcceptGas = await sr.overspendAcceptGas();
        try {

            assert.equal(overspendAcceptGas, false);
            await sr.setOverspendAcceptGas(true);
            overspendAcceptGas = await sr.overspendAcceptGas();
            assert.equal(overspendAcceptGas, true);

            let digest = await getTransactionHash(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, rhub.address, relAcc);
            let sig = await getTransactionSignature(web3, from, digest);

            assert.equal(AcceptRelayedCallReverted, (await rhub.canRelay(relAcc, from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, "0x")).status);

            let res = await rhub.relayCall(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, '0x', testutils.buildTxParameters({
                from: relAcc,
                gasPrice: gas_price,
                gasLimit: gas_limit_any_value
            }));

            assert.equal("CanRelayFailed", res.logs[0].event);
            assert.equal(AcceptRelayedCallReverted, res.logs[0].args.reason);
        } finally {
            // returning state to previous one
            await sr.setOverspendAcceptGas(false);
            overspendAcceptGas = await sr.overspendAcceptGas();
            assert.equal(overspendAcceptGas, false);
        }


    });

    it("should not execute the 'relayedCall' if 'preRelayedCall' reverts", async function () {

        let PreRelayedCallReverted = 2;
        let revertPreRelayCall = await sr.revertPreRelayCall();
        try {

            assert.equal(revertPreRelayCall, false);
            await sr.setRevertPreRelayCall(true);

            revertPreRelayCall = await sr.revertPreRelayCall();
            assert.equal(revertPreRelayCall, true);

            let digest = await getTransactionHash(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, rhub.address, relAcc);
            let sig = await getTransactionSignature(web3, from, digest);

            let res = await rhub.relayCall(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, '0x', testutils.buildTxParameters({
                from: relAcc,
                gasPrice: gas_price,
                gasLimit: gas_limit_any_value
            }));

            let startBlock = await web3.eth.getBlockNumber()
            // There should not be an event emitted, which means the result of 'relayCall' was indeed reverted
            var logs_messages = await sr.contract.getPastEvents("SampleRecipientEmitted", {
                fromBlock: startBlock,
                toBlock: 'latest'
            });
            assert.equal(0, logs_messages.length)

            relay_nonce++;

            assert.equal("TransactionRelayed", res.logs[0].event);
            assert.equal(PreRelayedCallReverted, res.logs[0].args.status);
            assert.equal(1, res.logs.length);
        } finally {
            // returning state to previous one
            await sr.setRevertPreRelayCall(false);
            revertPreRelayCall = await sr.revertPreRelayCall();
            assert.equal(revertPreRelayCall, false);
        }
    });

    it("should revert the 'relayedCall' if 'postRelayedCall' reverts", async function () {

        let PostRelayedCallReverted = 3;
        let revertPostRelayCall = await sr.revertPostRelayCall();
        try {

            assert.equal(revertPostRelayCall, false);
            await sr.setRevertPostRelayCall(true);

            revertPostRelayCall = await sr.revertPostRelayCall();
            assert.equal(revertPostRelayCall, true);

            let digest = await getTransactionHash(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, rhub.address, relAcc);
            let sig = await getTransactionSignature(web3, from, digest);

            let res = await rhub.relayCall(from, to, transaction, transaction_fee, gas_price, gas_limit, relay_nonce, sig, '0x', testutils.buildTxParameters({
                from: relAcc,
                gasPrice: gas_price,
                gasLimit: gas_limit_any_value
            }));

            let startBlock = await web3.eth.getBlockNumber()
            // There should not be an event emitted, which means the result of 'relayCall' was indeed reverted
            var logs_messages = await sr.contract.getPastEvents("SampleRecipientEmitted", {
                fromBlock: startBlock,
                toBlock: 'latest'
            });
            assert.equal(0, logs_messages.length)

            relay_nonce++;

            assert.equal("TransactionRelayed", res.logs[0].event);
            assert.equal(PostRelayedCallReverted, res.logs[0].args.status);
            assert.equal(1, res.logs.length);
        } finally {
            // returning state to previous one
            await sr.setRevertPostRelayCall(false);
            revertPostRelayCall = await sr.revertPostRelayCall();
            assert.equal(revertPostRelayCall, false);
        }
    });

});
