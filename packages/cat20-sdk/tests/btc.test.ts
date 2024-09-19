import {EcKeyService} from "../src/utils/eckey";
import {AddressType} from "../src/common";

describe("bitcoin", () => {
    test("wallet service", async () => {
        const privateKey = "L37qpvGk4vqKd3iBMAvaCNfgVJQKpc6qebKeAVk4BCpc9vy42dW7"
        const eckey = new EcKeyService(privateKey, AddressType.P2TR)
        console.info(eckey.getWif())
        console.info(eckey.getAddress().toString())
    })
})
;

