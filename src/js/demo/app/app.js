const $ = require('jquery');
const Cookie = require('js-cookie');
const { Counter } = require('./counter');
const { Wallet } = require('./wallet');

let counter;
let wallet;

const initializeWallet = function() {
    const store = {
        load: () => Cookie.get('wallet'),
        save: (data) => Cookie.set('wallet', data),
    }
    wallet = new Wallet(store);

    if (wallet.getCount() === 0) {
        account = wallet.newAccount();
    }
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

    await counter.increment();
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

$(async () => {
    counter = new Counter('http://localhost:4444', '0x0e19674ebc2c2B6Df3e7a1417c49b50235c61924');
    initializeWallet();

    for (let i = 0; i < wallet.getCount(); i++) {
        await renderAccount(wallet.get(i));
    }

    $('.btn-new-account').click(newAccount);
});
