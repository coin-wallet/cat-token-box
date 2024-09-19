import {
    getTokenContractP2TR,
    OpenMinterTokenInfo,
    p2tr2Address,
    SupportedNetwork, TokenContract,
    TokenMetadata,
    toP2tr
} from "../common";
import {ProtocolState, ProtocolStateList} from "@cat-protocol/cat-smartcontracts";
import {UTXO} from "scrypt-ts";


export function tokenInfoParse(tokenStr: string, network: SupportedNetwork): TokenMetadata {
    const token: TokenMetadata = JSON.parse(tokenStr);

    const tokenInfo: OpenMinterTokenInfo = JSON.parse(JSON.stringify(token.info));

    if (tokenInfo.max) {
        // convert string to  bigint
        tokenInfo.max = BigInt(tokenInfo.max);
        tokenInfo.premine = BigInt(tokenInfo.premine);
        tokenInfo.limit = BigInt(tokenInfo.limit);
    }

    token.info = tokenInfo

    if (!token.tokenAddr) {
        const minterP2TR = toP2tr(token.minterAddr);
        token.tokenAddr = p2tr2Address(
            getTokenContractP2TR(minterP2TR).p2tr,
            network,
        );
    }

    return token
}

export function feeUtxoParse(tokenUtxos: string): UTXO[] {
    const utxos = JSON.parse(tokenUtxos);
    return utxos.map((utxo: any) => {
        return {
            txId: utxo.txid,
            outputIndex: utxo.vout,
            script: utxo.scriptPk,
            satoshis: utxo.satoshi,
        };
    });
}
export function tokenUtxoParse(feeUtxos: string): Array<TokenContract> {
    const utxos = JSON.parse(feeUtxos);

    return utxos.map((c: any) => {
        const protocolState = ProtocolState.fromStateHashList(
            c.txoStateHashes as ProtocolStateList,
        );

        if (typeof c.utxo.satoshis === 'string') {
            c.utxo.satoshis = parseInt(c.utxo.satoshis);
        }

        const r: TokenContract = {
            utxo: c.utxo,
            state: {
                protocolState,
                data: {
                    ownerAddr: c.state.address,
                    amount: BigInt(c.state.amount),
                },
            },
        };

        return r;
    })
}
