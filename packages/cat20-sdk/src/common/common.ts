import {AddressType} from "./cat20Enum";
import {TokenContract} from "./contract";

export type SignTxParams = {
    privateKey: string;
    data: TransferParams;
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
    tokenAmount: string,
    tokenPrevTxs: TokenPrevTx[],
    verifyScript?: boolean,
    guard? : string,
}

export type UtxoInput = {
    txId: string
    vOut: number
    amount: number  // min unit: satoshi
    address?: string
}
