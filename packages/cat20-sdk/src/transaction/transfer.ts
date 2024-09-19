import {AddressType, btc, getTokenContractP2TR, SupportedNetwork, TokenContract, toP2tr} from "../common";
import {UTXO} from 'scrypt-ts';
import {EcKeyService,} from "../utils/eckey";
import {tokenInfoParse} from "../utils/paramsUtils";


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
    console.info(ecKey)

    const txParams: TransferParams = param.data

    let metadata = tokenInfoParse(txParams.tokenMetadata, SupportedNetwork.fractalMainnet);

    const minterP2TR = toP2tr(metadata.minterAddr);

    const {p2tr: tokenP2TR, tapScript: tokenTapScript} = getTokenContractP2TR(minterP2TR);


}

