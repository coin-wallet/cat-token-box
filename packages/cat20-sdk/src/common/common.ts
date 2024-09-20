import {AddressType} from "./cat20Enum";
import {TokenContract} from "./contact";
import {UTXO,} from 'scrypt-ts';

export type CatTxParams = {
    privateKey: string;
    addressType: AddressType,
    data: any;
};

export type TxIdHex = {
    txId: string;
    txHex: string;
}

export type TokenPrevTx = {
    prevTx: string,
    prevPrevTx: string,
}

// transfer
export interface TransferParams {
    tokenMetadata: string
    feeUtxo: UTXO, // 暂时只支持一个feeUtxo输入
    feeRate: number,
    tokens: TokenContract[],
    changeAddress: string,
    toAddress: string,
    tokenAmount: number,
    tokenPrevTxs: TokenPrevTx[]
}
