const Web3 = require('web3');
const RelayProvider = require('../../relayclient/RelayProvider');
const Contract = require('truffle-contract');
const counterABI = require('./counter-abi');

const Counter = function(url, address) {
    this.client = new Web3(url);
    this.address = address;
    this.client.setProvider(new RelayProvider(this.client.currentProvider, {}));
    this.contract = Contract({
        abi: counterABI
    });
    this.contract.setProvider(this.client.currentProvider);
};

Counter.prototype.setAccount = function(account) {
    this.account = account;
    this.client.currentProvider.relayClient.useKeypairForSigning(account);
};

Counter.prototype.getAccount = function() {
    return this.account;
};

Counter.prototype.ensureContractInstance = async function() {
    if (this.contractInstance == null) {
        this.contractInstance = await this.contract.at(this.address);
    }
};

Counter.prototype.ensureAccount = function() {
    if (this.account == null) {
        throw "Account not set";
    }
};

Counter.prototype.getCount = async function() {
    this.ensureAccount();
    await this.ensureContractInstance();
    return await this.contractInstance.get({ from: this.account.address });
};

Counter.prototype.increment = async function() {
    this.ensureAccount();
    await this.ensureContractInstance();
    // gasPrice in null will make the RelayClient choose a gasPrice dependant on
    // the current network gas price
    return await this.contractInstance.increment({ from: this.account.address, gasPrice: null });
};

module.exports = {
    Counter,
};
