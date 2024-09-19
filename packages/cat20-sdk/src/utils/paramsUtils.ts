import {getTokenContractP2TR, OpenMinterTokenInfo, p2tr2Address, TokenMetadata, toP2tr} from "../common";
import {SupportedNetwork} from "../common/cli-config";


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
