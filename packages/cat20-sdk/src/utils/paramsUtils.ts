import {btc, OpenMinterTokenInfo, SupportedNetwork, TokenContract, TokenMetadata, UtxoInput,} from "../common";
import {ProtocolState, ProtocolStateList} from "@cat-protocol/cat-smartcontracts";
import {UTXO} from "scrypt-ts";
import {getTokenContractP2TR, p2tr2Address, scaleByDecimals, toP2tr} from "./utils";

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

export function feeUtxoParse(utxo: UtxoInput): UTXO {
    let scriptPk = btc.Script.fromAddress(utxo.address).toHex();
    return {
        txId: utxo.txId,
        outputIndex: utxo.vOut,
        script: scriptPk,
        satoshis: utxo.amount,
    };
}


export function tokenUtxoParse(tokenUtxos: string): Array<TokenContract> {
    const utxos = JSON.parse(tokenUtxos);

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


export function scaleConfig(config: OpenMinterTokenInfo): OpenMinterTokenInfo {
    const clone = Object.assign({}, config);

    clone.max = scaleByDecimals(config.max, config.decimals);
    clone.premine = scaleByDecimals(config.premine, config.decimals);
    clone.limit = scaleByDecimals(config.limit, config.decimals);

    return clone;
}
