import {WalletService} from "../src/wallet";
import {AddressType} from "../src/common";

describe("bitcoin", () => {
    test("wallet service", async () => {
        const privateKey = "L37qpvGk4vqKd3iBMAvaCNfgVJQKpc6qebKeAVk4BCpc9vy42dW7"
        const wallet = new WalletService(privateKey, AddressType.P2TR)
        console.info(wallet.getWif())
        console.info(wallet.getAddress().toString())
    })
})
;

