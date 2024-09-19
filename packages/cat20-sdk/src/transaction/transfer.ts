import {AddressType, btc, TokenContract} from "../common";
import {UTXO} from 'scrypt-ts';
import {EcKeyService,} from "../utils/eckey";


export type CatTxParams = {
    privateKey: string;
    addressType: AddressType,
    data: any;
};

// transfer
export interface TransferParams {
    tokenMetadata: string
    feeUtxo: UTXO, // 暂时只支持一个feeUtxo输入
    feeRate: number,
    tokens: TokenContract[],
    changeAddress: btc.Address,
    receiver: btc.Address,
    tokenAmount: bigint,
    preTxMap: Map<string, string>,
    prePreTxMap: Map<string, string>,
}


export function transfer(param: CatTxParams) {

    const ecKey = new EcKeyService(param.privateKey, param.addressType)



}

