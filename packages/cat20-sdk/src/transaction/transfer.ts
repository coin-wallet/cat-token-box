import {
    AddressType,
    btc,
    callToBufferList,
    CHANGE_MIN_POSTAGE,
    getDummySigner,
    getDummyUTXO,
    getGuardsP2TR,
    getTokenContractP2TR,
    GuardContract,
    OpenMinterTokenInfo,
    Postage,
    SupportedNetwork,
    TokenContract,
    toP2tr,
    toStateScript,
    toTokenAddress,
    toTxOutpoint,
    verifyContract
} from "../common";
import {fill, int2ByteString, MethodCallOptions, PubKey, toByteString, UTXO,} from 'scrypt-ts';
import {EcKeyService,} from "../utils/eckey";
import {scaleConfig, tokenInfoParse} from "../utils/paramsUtils";
import {
    CAT20,
    CAT20Proto,
    CAT20State,
    ChangeInfo,
    emptyTokenAmountArray,
    emptyTokenArray,
    getBackTraceInfo,
    getTxCtxMulti,
    getTxHeaderCheck,
    GuardInfo,
    GuardProto,
    MAX_INPUT,
    MAX_TOKEN_OUTPUT,
    PreTxStatesInfo,
    ProtocolState,
    TokenUnlockArgs,
    TransferGuard
} from "@cat-protocol/cat-smartcontracts";
import Decimal from 'decimal.js';
import {TokenTx, validatePrevTx} from "../utils/prevTx";

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
    receiver: string,
    tokenAmount: number,
    tokenPrevTxs: TokenPrevTx[]
}


export async function transfer(param: CatTxParams) {
    const ecKey = new EcKeyService(param.privateKey, param.addressType)

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


    let tokens = txParams.tokens;
    const commitResult = createGuardContract(
        ecKey,
        txParams.feeUtxo,
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

    const receiverTokenState = CAT20Proto.create(
        amount,
        toTokenAddress(receiver),
    );

    newState.updateDataList(0, CAT20Proto.toByteString(receiverTokenState));

    const tokenInputAmount = tokens.reduce(
        (acc, t) => acc + t.state.data.amount,
        0n,
    );

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
    };

    const inputUtxos = [
        ...tokens.map((t) => t.utxo),
        guardContract.utxo,
        newFeeUtxo,
    ];

    if (inputUtxos.length > MAX_INPUT) {
        throw new Error('to much input');
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
        return null
    }

    for (let i = 0; i < tokens.length; i++) {
        const prevTx = txParams.tokenPrevTxs[i].prevTx;
        const prevPrevTx = txParams.tokenPrevTxs[i].prevPrevTx;
        const res = validatePrevTx(metadata, prevTx, prevPrevTx, SupportedNetwork.fractalMainnet)
        if (res === null) {
            return null
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

    let vsize = 500

    const satoshiChangeAmount =
        revealTx.inputAmount -
        vsize * txParams.feeRate -
        Postage.TOKEN_POSTAGE -
        (changeTokenState === null ? 0 : Postage.TOKEN_POSTAGE);

    if (satoshiChangeAmount <= CHANGE_MIN_POSTAGE) {
        console.error('Insufficient satoshis balance!');
        return null;
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
            false,
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
        false,
    );

    if (!res) {
        return null;
    }

    ecKey.signTx(revealTx);

    return {
        revealTx: revealTx.uncheckedSerialize(),
        commitTx: commitTx.uncheckedSerialize(),
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


async function unlockToken(
    wallet: EcKeyService,
    tokenContract: TokenContract,
    tokenInputIndex: number,
    prevTokenTx: btc.Transaction,
    preTokenInputIndex: number,
    prevPrevTokenTx: btc.Transaction,
    guardInfo: GuardInfo,
    revealTx: btc.Transaction,
    minterP2TR: string,
    txCtx: any,
    verify: boolean,
) {
    const {cblock: cblockToken, contract: token} = getTokenContractP2TR(minterP2TR);

    const {shPreimage, prevoutsCtx, spentScripts, sighash} = txCtx;

    const sig = btc.crypto.Schnorr.sign(
        wallet.getTokenPrivateKey(),
        sighash.hash,
    );
    const pubkeyX = wallet.getXOnlyPublicKey();
    const pubKeyPrefix = wallet.getPubKeyPrefix();
    const tokenUnlockArgs: TokenUnlockArgs = {
        isUserSpend: true,
        userPubKeyPrefix: pubKeyPrefix,
        userPubKey: PubKey(pubkeyX),
        userSig: sig.toString('hex'),
        contractInputIndex: 0n,
    };

    const backtraceInfo = getBackTraceInfo(
        prevTokenTx,
        prevPrevTokenTx,
        preTokenInputIndex,
    );

    const {
        state: {protocolState, data: preState},
    } = tokenContract;

    await token.connect(getDummySigner());
    const preTxState: PreTxStatesInfo = {
        statesHashRoot: protocolState.hashRoot,
        txoStateHashes: protocolState.stateHashList,
    };

    const tokenCall = await token.methods.unlock(
        tokenUnlockArgs,
        preState,
        preTxState,
        guardInfo,
        backtraceInfo,
        shPreimage,
        prevoutsCtx,
        spentScripts,
        {
            fromUTXO: getDummyUTXO(),
            verify: false,
            exec: false,
        } as MethodCallOptions<CAT20>,
    );

    const witnesses = [
        ...callToBufferList(tokenCall),
        // taproot script + cblock
        token.lockingScript.toBuffer(),
        Buffer.from(cblockToken, 'hex'),
    ];
    revealTx.inputs[tokenInputIndex].witnesses = witnesses;

    if (verify) {
        const res = verifyContract(
            tokenContract.utxo,
            revealTx,
            tokenInputIndex,
            witnesses,
        );
        if (typeof res === 'string') {
            console.error('unlocking token contract failed!', res);
            return false;
        }
        return true;
    }

    return true;
}


async function unlockGuard(
    guardContract: GuardContract,
    guardInfo: GuardInfo,
    guardInputIndex: number,
    newState: ProtocolState,
    revealTx: btc.Transaction,
    receiverTokenState: CAT20State,
    changeTokenState: null | CAT20State,
    changeInfo: ChangeInfo,
    txCtx: any,
    verify: boolean,
) {
    // amount check run verify

    const {shPreimage, prevoutsCtx, spentScripts} = txCtx;
    const outputArray = emptyTokenArray();
    const tokenAmountArray = emptyTokenAmountArray();
    const tokenOutputIndexArray = fill(false, MAX_TOKEN_OUTPUT);
    outputArray[0] = receiverTokenState.ownerAddr;
    tokenAmountArray[0] = receiverTokenState.amount;
    tokenOutputIndexArray[0] = true;

    if (changeTokenState) {
        outputArray[1] = changeTokenState.ownerAddr;
        tokenAmountArray[1] = changeTokenState.amount;
        tokenOutputIndexArray[1] = true;
    }

    const satoshiChangeOutputIndex = changeTokenState === null ? 1 : 2;

    const {cblock: transferCblock, contract: transferGuard} = getGuardsP2TR();

    await transferGuard.connect(getDummySigner());

    const outpointSatoshiArray = emptyTokenArray();
    outpointSatoshiArray[satoshiChangeOutputIndex] = changeInfo.satoshis;
    outputArray[satoshiChangeOutputIndex] = changeInfo.script;
    tokenOutputIndexArray[satoshiChangeOutputIndex] = false;

    const transferGuardCall = await transferGuard.methods.transfer(
        newState.stateHashList,
        outputArray,
        tokenAmountArray,
        tokenOutputIndexArray,
        outpointSatoshiArray,
        int2ByteString(BigInt(Postage.TOKEN_POSTAGE), 8n),
        guardContract.state.data,
        guardInfo.tx,
        shPreimage,
        prevoutsCtx,
        spentScripts,
        {
            fromUTXO: getDummyUTXO(),
            verify: false,
            exec: false,
        } as MethodCallOptions<TransferGuard>,
    );
    const witnesses = [
        ...callToBufferList(transferGuardCall),
        // taproot script + cblock
        transferGuard.lockingScript.toBuffer(),
        Buffer.from(transferCblock, 'hex'),
    ];
    revealTx.inputs[guardInputIndex].witnesses = witnesses;

    if (verify) {
        const res = verifyContract(
            guardContract.utxo,
            revealTx,
            guardInputIndex,
            witnesses,
        );
        if (typeof res === 'string') {
            console.error('unlocking guard contract failed!', res);
            return false;
        }
        return true;
    }
    return true;
}
