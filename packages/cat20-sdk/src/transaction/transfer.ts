import {
    AddressType,
    btc,
    SignTxParams,
    CHANGE_MIN_POSTAGE,
    GuardContract,
    OpenMinterTokenInfo, Postage,
    SupportedNetwork,
    TokenContract,
    TransferParams
} from "../common";
import {int2ByteString, toByteString,} from 'scrypt-ts';
import {EcKeyService,} from "../utils/eckey";
import {feeUtxoParse, scaleConfig, tokenInfoParse} from "../utils/paramsUtils";
import {
    CAT20Proto,
    CAT20State,
    ChangeInfo,
    getTxCtxMulti,
    getTxHeaderCheck,
    GuardInfo,
    MAX_INPUT,
    ProtocolState
} from "@cat-protocol/cat-smartcontracts";
import Decimal from 'decimal.js';
import {TokenTx, validatePrevTx} from "../utils/prevTx";
import {createGuardContract, unlockGuard, unlockToken} from "./functions";
import {getTokenContractP2TR, resetTx, toP2tr, toStateScript, toTokenAddress, toTxOutpoint,} from "../utils";
import {mergeFee} from "./merge";


export async function transfer(param: SignTxParams) {
    // todo: add addresstype param if want to allow segwit addresses
    const ecKey = new EcKeyService(param.privateKey, AddressType.P2TR);

    const txParams: TransferParams = param.data

    let metadata = tokenInfoParse(txParams.tokenMetadata, SupportedNetwork.fractalMainnet);
    const minterP2TR = toP2tr(metadata.minterAddr);
    const {p2tr: tokenP2TR, tapScript: tokenTapScript} = getTokenContractP2TR(minterP2TR);
    let verifyScript = txParams.verifyScript || false;

    // address and cat-amount
    let receiver: btc.Address;
    let amount: bigint;
    try {
        receiver = btc.Address.fromString(txParams.toAddress);
    } catch (error) {
        throw new Error(`Invalid receiver address: ${txParams.toAddress}`);
    }

    if (receiver.type !== 'taproot') {
        throw new Error(`Invalid address type: ${receiver.type}`);
    }

    const scaledInfo = scaleConfig(metadata.info as OpenMinterTokenInfo);
    try {
        const d = new Decimal(txParams.tokenAmount).mul(Math.pow(10, scaledInfo.decimals));
        amount = BigInt(d.toString());
    } catch (error) {
        throw new Error(`Invalid token amount:  ${txParams.tokenAmount}`);
    }

    const feeUtxos = feeUtxoParse(param.data.feeInputs)
    let feeUtxo = feeUtxos[0]

    let mergeTx: btc.Transaction
    if (feeUtxos.length > 1){
        ({feeUtxo, mergeTx} = mergeFee(ecKey, feeUtxos, txParams.feeRate))
    }

    let tokens = txParams.tokens;

    const commitResult = createGuardContract(
        ecKey,
        feeUtxo,
        txParams.feeRate,
        tokens,
        tokenP2TR,
        txParams.changeAddress,
    );

    if (commitResult === null) {
        return null;
    }
    const {commitTx, contact: guardContract, guardTapScript} = commitResult;

    const newState = ProtocolState.getEmptyState();

    const receiverTokenState = CAT20Proto.create(amount, toTokenAddress(receiver),);

    newState.updateDataList(0, CAT20Proto.toByteString(receiverTokenState));

    const tokenInputAmount = tokens.reduce((acc, t) => acc + t.state.data.amount, 0n,);

    const changeTokenInputAmount = tokenInputAmount - amount;

    let changeTokenState: null | CAT20State = null;

    if (changeTokenInputAmount > 0n) {
        const tokenChangeAddress = ecKey.getTokenAddress();
        changeTokenState = CAT20Proto.create(
            changeTokenInputAmount,
            tokenChangeAddress,
        );
        newState.updateDataList(1, CAT20Proto.toByteString(changeTokenState));
    }

    const newFeeUtxo = {
        txId: commitTx.id,
        outputIndex: 2,
        script: commitTx.outputs[2].script.toHex(),
        satoshis: commitTx.outputs[2].satoshis,
    }

    const inputUtxos = [
        ...tokens.map((t) => t.utxo),
        guardContract.utxo,
        newFeeUtxo,
    ];

    if (inputUtxos.length > MAX_INPUT) {
        throw new Error('Too many inputs, max 4 token inputs');
    }

    const revealTx = new btc.Transaction()
        .from(inputUtxos)
        .addOutput(
            new btc.Transaction.Output({
                satoshis: 0,
                script: toStateScript(newState),
            }),
        )
        .addOutput(
            new btc.Transaction.Output({
                satoshis: Postage.TOKEN_POSTAGE,
                script: tokenP2TR,
            }),
        )
        .feePerByte(txParams.feeRate);

    if (changeTokenState) {
        revealTx.addOutput(
            new btc.Transaction.Output({
                satoshis: Postage.TOKEN_POSTAGE,
                script: tokenP2TR,
            }),
        );
    }

    const satoshiChangeScript = btc.Script.fromAddress(txParams.changeAddress);
    revealTx.addOutput(
        new btc.Transaction.Output({
            satoshis: 0,
            script: satoshiChangeScript,
        }),
    );

    let tokenTxs: TokenTx[] = []
    if (txParams.tokenPrevTxs.length !== tokens.length) {
        throw new Error('Invalid tokenPrevTxs length');
    }

    for (let i = 0; i < tokens.length; i++) {
        const prevTx = txParams.tokenPrevTxs[i].prevTx;
        const prevPrevTx = txParams.tokenPrevTxs[i].prevPrevTx;
        const res = validatePrevTx(metadata, prevTx, prevPrevTx, SupportedNetwork.fractalMainnet)
        if (res === null) {
            throw new Error('Invalid prevPrevTx');
        }
        tokenTxs.push(res)
    }

    const guardCommitTxHeader = getTxHeaderCheck(
        commitTx,
        guardContract.utxo.outputIndex,
    );

    const guardInputIndex = tokens.length;
    const guardInfo: GuardInfo = {
        outputIndex: toTxOutpoint(
            guardContract.utxo.txId,
            guardContract.utxo.outputIndex,
        ).outputIndex,
        inputIndexVal: BigInt(guardInputIndex),
        tx: guardCommitTxHeader.tx,
        guardState: guardContract.state.data,
    };

    const vsize = await calcVsize(
        ecKey,
        tokens,
        guardContract,
        revealTx,
        guardInfo,
        tokenTxs,
        tokenTapScript,
        guardTapScript,
        newState,
        receiverTokenState,
        changeTokenState,
        satoshiChangeScript,
        minterP2TR,
    );

    const satoshiChangeAmount = revealTx.inputAmount - vsize * txParams.feeRate - Postage.TOKEN_POSTAGE - (changeTokenState === null ? 0 : Postage.TOKEN_POSTAGE);

    if (satoshiChangeAmount <= CHANGE_MIN_POSTAGE) {
        throw new Error('Insufficient satoshis balance!');
    }

    const satoshiChangeOutputIndex = changeTokenState === null ? 2 : 3;

    // update change amount
    revealTx.outputs[satoshiChangeOutputIndex].satoshis = satoshiChangeAmount;


    const txCtxs = getTxCtxMulti(
        revealTx,
        tokens.map((_, i) => i).concat([tokens.length]),
        [
            ...new Array(tokens.length).fill(Buffer.from(tokenTapScript, 'hex')),
            Buffer.from(guardTapScript, 'hex'),
        ],
    );

    const changeInfo: ChangeInfo = {
        script: toByteString(satoshiChangeScript.toHex()),
        satoshis: int2ByteString(BigInt(satoshiChangeAmount), 8n),
    };

    for (let i = 0; i < tokens.length; i++) {
        // ignore changeInfo when transfer token
        const res = await unlockToken(
            ecKey,
            tokens[i],
            i,
            tokenTxs[i].prevTx,
            tokenTxs[i].prevTokenInputIndex,
            tokenTxs[i].prevPrevTx,
            guardInfo,
            revealTx,
            minterP2TR,
            txCtxs[i],
            verifyScript,
        );

        if (!res) {
            return null;
        }
    }
    const res = await unlockGuard(
        guardContract,
        guardInfo,
        guardInputIndex,
        newState,
        revealTx,
        receiverTokenState,
        changeTokenState,
        changeInfo,
        txCtxs[guardInputIndex],
        verifyScript,
    );

    if (!res) {
        return null;
    }

    // console.log(
    //     mergeTx ? mergeTx.getFee() : 0,
    //     revealTx.getFee(),
    //     commitTx.getFee(),
    // );
    //
    ecKey.signTx(revealTx);
    return {
        mergeTx: mergeTx ? mergeTx.uncheckedSerialize() : null,
        revealTx: revealTx.uncheckedSerialize(),
        commitTx: commitTx.uncheckedSerialize(),
    }
}

const calcVsize = async (
    wallet: EcKeyService,
    tokens: TokenContract[],
    guardContract: GuardContract,
    revealTx: btc.Transaction,
    guardInfo: GuardInfo,
    tokenTxs: Array<{
        prevTx: btc.Transaction;
        prevPrevTx: btc.Transaction;
        prevTokenInputIndex: number;
    }>,
    tokenTapScript: string,
    guardTapScript: string,
    newState: ProtocolState,
    receiverTokenState: CAT20State,
    changeTokenState: null | CAT20State,
    satoshisChangeScript: btc.Script,
    minterP2TR: string,
) => {
    const txCtxs = getTxCtxMulti(
        revealTx,
        tokens.map((_, i) => i).concat([tokens.length]),
        [
            ...new Array(tokens.length).fill(Buffer.from(tokenTapScript, 'hex')),
            Buffer.from(guardTapScript, 'hex'),
        ],
    );

    const guardInputIndex = tokens.length;

    const changeInfo: ChangeInfo = {
        script: satoshisChangeScript.toHex(),
        satoshis: int2ByteString(0n, 8n),
    };
    for (let i = 0; i < tokens.length; i++) {
        await unlockToken(
            wallet,
            tokens[i],
            i,
            tokenTxs[i].prevTx,
            tokenTxs[i].prevTokenInputIndex,
            tokenTxs[i].prevPrevTx,
            guardInfo,
            revealTx,
            minterP2TR,
            txCtxs[i],
            false,
        );
    }

    await unlockGuard(
        guardContract,
        guardInfo,
        guardInputIndex,
        newState,
        revealTx,
        receiverTokenState,
        changeTokenState,
        changeInfo,
        txCtxs[guardInputIndex],
        false,
    );

    wallet.signTx(revealTx);
    const vsize = revealTx.vsize;
    resetTx(revealTx);
    return vsize;
};
