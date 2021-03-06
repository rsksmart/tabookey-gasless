const ethUtils = require('ethereumjs-util');
const EthCrypto = require('eth-crypto');
const web3Utils = require('web3-utils')
const relay_prefix = "rlx:"

function toUint256_noPrefix(int) {
    return removeHexPrefix(ethUtils.bufferToHex(ethUtils.setLengthLeft(int, 32)));
}

function removeHexPrefix(hex) {
    return hex.replace(/^0x/, '');
}

const zeroPad = "0000000000000000000000000000000000000000000000000000000000000000"

function padTo64(hex) {
    if (hex.length < 64) {
        hex = (zeroPad + hex).slice(-64);
    }
    return hex;
}

function bytesToHex_noPrefix(bytes) {
    let hex = removeHexPrefix(web3Utils.toHex(bytes))
    if (hex.length % 2 != 0) {
        hex = "0" + hex;
    }
    return hex
}

const WELL_FORMED_SIGNATURE_LENGTH = 2+(32+32+1)*2; // 0x prefix + 32 bytes r + 32 bytes s + 1 byte v
const MINIMUM_SIGNATURE_LENGTH = 2+(31+31+1)*2; // 0x prefix + 31 bytes r + 31 bytes s + 1 byte v
const SINGLE_COMPONENT_MALFORMED_SIGNATURE_LENGTH = 2+(32+31+1)*2; // 0x prefix + 32 bytes r/s + 31 bytes s/r + 1 byte v

function sanitizeJsonRpcSignature(signature, hash, account, web3cli) {
    if (signature.length === WELL_FORMED_SIGNATURE_LENGTH) {
        return signature;
    }

    if (signature.length < MINIMUM_SIGNATURE_LENGTH) {
        throw new Error("Cannot sanitize signature '" + signature +"': less than minimum length");
    }

    let sanitized;

    if (signature.length === MINIMUM_SIGNATURE_LENGTH) {
        sanitized = "0x" + "00" + signature.substr(2, 62) + "00" + signature.substr(64, 64);
        tryRecover(sanitized, signature, hash, account, web3cli);
        return sanitized;
    }

    if (signature.length === SINGLE_COMPONENT_MALFORMED_SIGNATURE_LENGTH) {
        // 31 bytes belong to R
        try {
            sanitized = "0x" + "00" + signature.substr(2, 62) + signature.substr(64, 66);
            tryRecover(sanitized, signature, hash, account, web3cli);
            return sanitized;
        } catch (e) {
            // 31 bytes belong to S
            sanitized = "0x" + signature.substr(2, 64) + "00" + signature.substr(66, 64);
            tryRecover(sanitized, signature, hash, account, web3cli);
            return sanitized;
        }
    }

    throw new Error("Could not sanitize signature '" + signature + "': unexpected error");
}

function tryRecover(signature, originalSignature, hash, account, web3cli) {
    try {
        const recovered = web3cli.eth.accounts.recover(hash, signature);
        if (recovered.toLowerCase() !== account.toLowerCase()) {
            throw new Error("Could not sanitize signature '" + originalSignature + "': inconsistent recovery");
        }
    } catch (e) {
        throw new Error("Could not sanitize signature '" + originalSignature + "': " + e);
    }
}

module.exports = {
    sanitizeJsonRpcSignature,
    register_new_relay: async function (relayHub, stake, delay, txFee, url, account) {
        await relayHub.stake(account, delay, {from: account, value: stake})
        return await relayHub.registerRelay(txFee, url, {from: account})
    },

    getTransactionHash: function (from, to, tx, txfee, gas_price, gas_limit, nonce, relay_hub_address, relay_address) {
        let txhstr = bytesToHex_noPrefix(tx)
        let dataToHash =
            Buffer.from(relay_prefix).toString("hex") +
            removeHexPrefix(from)
            + removeHexPrefix(to)
            + txhstr
            + toUint256_noPrefix(parseInt(txfee))
            + toUint256_noPrefix(parseInt(gas_price))
            + toUint256_noPrefix(parseInt(gas_limit))
            + toUint256_noPrefix(parseInt(nonce))
            + removeHexPrefix(relay_hub_address)
            + removeHexPrefix(relay_address)
        return web3Utils.sha3('0x'+dataToHash )
    },

    getTransactionSignature: async function (web3, account, hash) {

        let sig_
        try {


            sig_ = await new Promise((resolve, reject) => {
                try {
                    web3.eth.personal.sign(hash, account, (err, res) => {
                        if (err) reject(err)
                        else resolve(res)
                    })
                } catch (e) {
                    reject(e)
                }
            })

        } catch (e) {

            sig_ = await new Promise((resolve, reject) => {
                web3.eth.sign(hash, account, (err, res) => {
                    if (err) reject(err)
                    else resolve(res)
                })
            })
        }

        let signature = sanitizeJsonRpcSignature(sig_, hash, account, web3);
        signature = ethUtils.fromRpcSig(signature);
        let sig = web3Utils.bytesToHex(signature.r) + removeHexPrefix(web3Utils.bytesToHex(signature.s)) + removeHexPrefix(web3Utils.toHex(signature.v));

        return sig;
    },

    getTransactionSignatureWithKey: function(privKey, hash, withPrefix=true) {
        let signed
        if (withPrefix){
            let msg = Buffer.concat([Buffer.from("\x19Ethereum Signed Message:\n32"), Buffer.from(removeHexPrefix(hash), "hex")])
            signed = web3Utils.sha3("0x"+msg.toString('hex') )
        }
        else
            signed = hash
        let keyHex = "0x" + Buffer.from(privKey).toString('hex')
        const sig_ = EthCrypto.sign(keyHex, signed)
        let signature = ethUtils.fromRpcSig(sig_);
        let sig = web3Utils.bytesToHex(signature.r) + removeHexPrefix(web3Utils.bytesToHex(signature.s)) + removeHexPrefix(web3Utils.toHex(signature.v));
        return sig
    },

    getEcRecoverMeta: function(message, signature) {
        if (typeof signature === 'string'){
            let r = this.parseHexString(signature.substr(2, 65))
            let s = this.parseHexString(signature.substr(66, 65))
            let v = this.parseHexString(signature.substr(130,2))

            signature = {
                v: v,
                r: r,
                s: s
            }
        }
        let msg = Buffer.concat([Buffer.from("\x19Ethereum Signed Message:\n32"), Buffer.from(removeHexPrefix(message), "hex")]);
        let signed = web3Utils.sha3("0x"+msg.toString('hex'));
        let buf_signed = Buffer.from(removeHexPrefix(signed), "hex");
        let signer = ethUtils.bufferToHex(ethUtils.pubToAddress(ethUtils.ecrecover(buf_signed, signature.v, signature.r, signature.s)));
        return signer;
    },

    parseHexString: function(str) {
        var result = [];
        while (str.length >= 2) {
            result.push(parseInt(str.substring(0, 2), 16));

            str = str.substring(2, str.length);
        }

        return result;
    },
    removeHexPrefix: removeHexPrefix,
    padTo64: padTo64
}
