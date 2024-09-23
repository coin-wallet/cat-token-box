import {AddressType} from "./cat20Enum";
import {TokenContract} from "./contract";

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
    feeInputs: UtxoInput[]
    feeRate: number,
    tokens: TokenContract[],
    changeAddress: string,
    toAddress: string,
    tokenAmount: number,
    tokenPrevTxs: TokenPrevTx[],
    verifyScript?: boolean,
}

export type UtxoInput = {
    txId: string
    vOut: number
    amount: number  // min unit: satoshi
    address?: string
}
