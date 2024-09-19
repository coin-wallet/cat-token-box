import {
    AddressType,
    btc,
    getGuardsP2TR,
    getTokenContractP2TR,
    GuardContract, OpenMinterTokenInfo,
    Postage,
    SupportedNetwork,
    TokenContract,
    toP2tr,
    toStateScript
} from "../common";
import {UTXO} from 'scrypt-ts';
import {EcKeyService,} from "../utils/eckey";
import {scaleConfig, tokenInfoParse} from "../utils/paramsUtils";
import {GuardProto, ProtocolState} from "@cat-protocol/cat-smartcontracts";
import Decimal from 'decimal.js';


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
    changeAddress: string,
    receiver: string,
    tokenAmount: number,
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

    // 地址和金额
    let receiver: btc.Address;
    let amount: bigint;
    try {
        receiver = btc.Address.fromString(txParams.receiver);
        if (receiver.type !== 'taproot') {
            console.error(`Invalid address type: ${receiver.type}`);
            return;
        }
    } catch (error) {
        console.error(`Invalid receiver address:  `, txParams.receiver);
        return;
    }

    const scaledInfo = scaleConfig(metadata.info as OpenMinterTokenInfo);
    try {
        const d = new Decimal(txParams.tokenAmount).mul(Math.pow(10, scaledInfo.decimals));
        amount = BigInt(d.toString());
    } catch (error) {
        console.error(`Invalid receiver address:  `, txParams.tokenAmount);
        return;
    }


    const commitResult = createGuardContract(
        ecKey,
        txParams.feeUtxo,
        txParams.feeRate,
        txParams.tokens,
        tokenP2TR,
        txParams.changeAddress,
    );


    if (commitResult === null) {
        return null;
    }


}


export function createGuardContract(
    wallet: EcKeyService,
    feeutxo: UTXO,
    feeRate: number,
    tokens: TokenContract[],
    tokenP2TR: string,
    changeAddress: btc.Address,
) {
    const {p2tr: guardP2TR, tapScript: guardTapScript} = getGuardsP2TR();

    const protocolState = ProtocolState.getEmptyState();
    const realState = GuardProto.createEmptyState();
    realState.tokenScript = tokenP2TR;

    for (let i = 0; i < tokens.length; i++) {
        realState.inputTokenAmountArray[i] = tokens[i].state.data.amount;
    }

    protocolState.updateDataList(0, GuardProto.toByteString(realState));

    const commitTx = new btc.Transaction()
        .from(feeutxo)
        .addOutput(
            new btc.Transaction.Output({
                satoshis: 0,
                script: toStateScript(protocolState),
            }),
        )
        .addOutput(
            new btc.Transaction.Output({
                satoshis: Postage.GUARD_POSTAGE,
                script: guardP2TR,
            }),
        )
        .feePerByte(feeRate)
        .change(changeAddress);

    if (commitTx.getChangeOutput() === null) {
        console.error('Insufficient satoshis balance!');
        return null;
    }
    commitTx.outputs[2].satoshis -= 1;
    wallet.signTx(commitTx);

    const contact: GuardContract = {
        utxo: {
            txId: commitTx.id,
            outputIndex: 1,
            script: commitTx.outputs[1].script.toHex(),
            satoshis: commitTx.outputs[1].satoshis,
        },
        state: {
            protocolState,
            data: realState,
        },
    };

    return {
        commitTx,
        contact,
        guardTapScript,
    };
}
