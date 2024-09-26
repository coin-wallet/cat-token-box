import {UTXO} from "scrypt-ts";
import {EcKeyService} from "../utils/eckey";
import {btc} from "../common";

export function mergeFee(
    wallet: EcKeyService,
    feeUtxos: UTXO[],
    feeRate: number,
){

    const address = wallet.getAddress();
     const mergeTx = new btc.Transaction()
        .from(feeUtxos)
        .feePerByte(feeRate)
        .change(address);

    if (mergeTx.getChangeOutput() === null) {
        throw new Error('Insufficient satoshis balance!');
    }
    const output = mergeTx.outputs[0]
    output.satoshis -= 1;
    wallet.signTx(mergeTx);

    const mergedFeeUtxo: UTXO = {
        address,
        txId: mergeTx.id,
        outputIndex: 0,
        script: output.script,
        satoshis: output.satoshis,
    }

    return {
        mergeTx,
        feeUtxo: mergedFeeUtxo,
    }
}