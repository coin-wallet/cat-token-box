import {btc, p2tr2Address, script2P2TR, SupportedNetwork, TokenMetadata} from "../common";

export function validatePrevTx(metadata: TokenMetadata,
                               prevTxHex: string,
                               prevPrevTxHex: string,
                               network: SupportedNetwork,
): boolean{

    let prevTokenInputIndex = 0;
    const prevTx = new btc.Transaction(prevTxHex);
    const input = prevTx.inputs.find((input: btc.Transaction.input, inputIndex: number) => {
        const witnesses = input.getWitnesses();

        if (Array.isArray(witnesses) && witnesses.length > 2) {
            const lockingScriptBuffer = witnesses[witnesses.length - 2];
            const { p2tr } = script2P2TR(lockingScriptBuffer);

            const address = p2tr2Address(p2tr, network);
            if (
                address === metadata.tokenAddr ||
                address === metadata.minterAddr
            ) {
                prevTokenInputIndex = inputIndex;
                return true;
            }
        }
    });

    const prevPrevTxId =
        prevTx.inputs[prevTokenInputIndex].prevTxId.toString('hex');

    const prevPrevTx = new btc.Transaction(prevPrevTxHex);
    return prevPrevTx.id == prevPrevTxId

}