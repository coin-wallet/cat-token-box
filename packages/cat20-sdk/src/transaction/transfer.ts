import {
    btc,
    CatTxParams,
    CHANGE_MIN_POSTAGE,
    getTokenContractP2TR,
    OpenMinterTokenInfo,
    Postage,
    SupportedNetwork,
    toP2tr,
    toStateScript,
    toTokenAddress,
    toTxOutpoint,
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
import {pickLargeFeeUtxo} from "../utils/utxo";
import {createGuardContract, unlockGuard, unlockToken} from "./functions";


export async function transfer(param: CatTxParams) {
    const ecKey = new EcKeyService(param.privateKey, param.addressType)

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
        if (receiver.type !== 'taproot') {
            console.error(`Invalid address type: ${receiver.type}`);
            return;
        }
    } catch (error) {
        console.error(`Invalid receiver address:  `, txParams.toAddress);
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
    const feeUtxos = feeUtxoParse(param.data.feeInputs)
    let feeUtxo = pickLargeFeeUtxo(feeUtxos);

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

    let vsize = 500 * 5

    const satoshiChangeAmount = revealTx.inputAmount - vsize * txParams.feeRate - Postage.TOKEN_POSTAGE - (changeTokenState === null ? 0 : Postage.TOKEN_POSTAGE);

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

    ecKey.signTx(revealTx);

    return {
        revealTx: revealTx.uncheckedSerialize(),
        commitTx: commitTx.uncheckedSerialize(),
    }
}

