// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import btc = require('bitcore-lib-inquisition');
import {AddressType, toXOnly,} from '../common';
import {hash160} from 'scrypt-ts';

export class WalletService {
    private readonly privateKey: string;
    private readonly addressType: AddressType;

    constructor(
        privateKey: string,
        addressType: AddressType,
    ) {
        this.privateKey = privateKey;
        this.addressType = addressType;
    }


    getWif(): string {
        return this.getPrivateKey().toWIF();
    }

    getPrivateKey(): btc.PrivateKey {
        return btc.PrivateKey.fromWIF(this.privateKey)
    }

    getAddressType(): AddressType {
        return this.addressType || AddressType.P2TR;
    };

    getP2TRAddress(): btc.Address {
        return this.getPrivateKey().toAddress(null, btc.Address.PayToTaproot);
    }

    getAddress(): btc.Address {
        return this.getP2TRAddress();
    }

    getXOnlyPublicKey(): string {
        const pubkey = this.getPublicKey();
        return toXOnly(pubkey.toBuffer()).toString('hex');
    }

    getTweakedPrivateKey(): btc.PrivateKey {
        const {tweakedPrivKey} = this.getPrivateKey().createTapTweak();
        return btc.PrivateKey.fromBuffer(tweakedPrivKey);
    }

    getPublicKey(): btc.PublicKey {
        const addressType = this.getAddressType();

        if (addressType === AddressType.P2TR) {
            return this.getTweakedPrivateKey().toPublicKey();
        } else if (addressType === AddressType.P2WPKH) {
            return this.getPrivateKey().toPublicKey();
        }
    }

    getPubKeyPrefix(): string {
        const addressType = this.getAddressType();
        if (addressType === AddressType.P2TR) {
            return '';
        } else if (addressType === AddressType.P2WPKH) {
            const pubkey = this.getPublicKey();
            return pubkey.toString().slice(0, 2);
        }
        return ''
    }

    getTokenAddress(): string {
        const addressType = this.getAddressType();

        if (addressType === AddressType.P2TR) {
            const xpubkey = this.getXOnlyPublicKey();
            return hash160(xpubkey);
        } else if (addressType === AddressType.P2WPKH) {
            const pubkey = this.getPublicKey();
            return hash160(pubkey.toString());
        } else {
            throw new Error(`Unsupported address type: ${addressType}`);
        }
    }

    getTaprootPrivateKey(): string {
        return this.getTweakedPrivateKey();
    }

    getTokenPrivateKey(): string {
        const addressType = this.getAddressType();

        if (addressType === AddressType.P2TR) {
            return this.getTaprootPrivateKey();
        } else if (addressType === AddressType.P2WPKH) {
            return this.getPrivateKey();
        } else {
            throw new Error(`Unsupported address type: ${addressType}`);
        }
    }

    signTx(tx: btc.Transaction) {
        // unlock fee inputs

        const privateKey = this.getPrivateKey();
        const hashData = btc.crypto.Hash.sha256ripemd160(
            privateKey.publicKey.toBuffer(),
        );

        for (let i = 0; i < tx.inputs.length; i++) {
            const input = tx.inputs[i];
            if (input.output.script.isWitnessPublicKeyHashOut()) {
                const signatures = input.getSignatures(
                    tx,
                    privateKey,
                    i,
                    undefined,
                    hashData,
                    undefined,
                    undefined,
                );

                tx.applySignature(signatures[0]);
            } else if (input.output.script.isTaproot() && !input.hasWitnesses()) {
                const signatures = input.getSignatures(
                    tx,
                    privateKey,
                    i,
                    btc.crypto.Signature.SIGHASH_ALL,
                    hashData,
                    undefined,
                    undefined,
                );

                tx.applySignature(signatures[0]);
            }
        }
    }
}
