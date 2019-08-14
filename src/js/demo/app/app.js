const $ = require('jquery');
const Cookie = require('js-cookie');
const { Counter } = require('./counter');
const { Wallet } = require('./wallet');
const { rpcHost, contractAddress } = require('./config.json');

let counter;
let wallet;

const initializeWallet = function() {
    const store = {
        load: () => Cookie.get('wallet'),
        save: (data) => Cookie.set('wallet', data),
    }
    wallet = new Wallet(store);
}

const refresh = (account, row) => async () => {
    counter.setAccount(account);
    const count = await counter.getCount();
    $('.counter-row-count .count', row).text(count);
};

const increment = (account, row) => async () => {
    counter.setAccount(account);
    $('.counter-row-refresh', row).attr('disabled', true);
    $('.counter-row-increment', row).attr('disabled', true);
    $('.counter-row-count .count', row).css('display', 'none');
    $('.counter-row-count .loading', row).css('display', '');

    try {
        await counter.increment();
    } catch (e) {
        console.log('ERROR TRYING TO INCREMENT', e);
    }
    await refresh(account, row)();

    $('.counter-row-count .count', row).css('display', '');
    $('.counter-row-count .loading', row).css('display', 'none');
    $('.counter-row-refresh', row).attr('disabled', false);
    $('.counter-row-increment', row).attr('disabled', false);
};

const renderAccount = async (account) => {
    const newRow = $('.counter-row-template').clone();
    newRow.removeClass('counter-row-template').addClass('counter-row');
    newRow.css('display', '');
    $('.counter-row-address', newRow).text(account.address);
    await refresh(account, newRow)();
    $('.counter-row-refresh', newRow).click(refresh(account, newRow));
    $('.counter-row-increment', newRow).click(increment(account, newRow));
    $('.counters-body').append(newRow);
};

const newAccount = async () => {
    renderAccount(wallet.newAccount());
};

const resetAccounts = () => {
    wallet.reset();
    $('.counters-body').empty();
};

$(async () => {
    $('.rpc-host').text(rpcHost);
    $('.contract-address').text(contractAddress);
    counter = new Counter(rpcHost, contractAddress);
    initializeWallet();

    for (let i = 0; i < wallet.getCount(); i++) {
        await renderAccount(wallet.get(i));
    }

    $('.btn-new-account').click(newAccount);
    $('.btn-reset-accounts').click(resetAccounts);
});
