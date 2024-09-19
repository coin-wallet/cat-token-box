import {tokenInfoParse} from "../src/utils/paramsUtils";


describe("cat20 params", () => {

    test("findTokenMetadataById getTokenMetadata ", async () => {
        // JSON string
        const tokenStr = '{"minterAddr":"bc1pqw9ncs4sna0ndh85ux5dhh9swueyjql23t4em8j0smywkqsngfmsn7gmua","tokenAddr":"bc1plhz9wf0desgz8t32xm67vay9hgdmrnwzjzujgg0k9883cfxxgkzs20qfd5","info":{"max":"21000000","name":"cat","limit":"5","symbol":"CAT","premine":"0","decimals":2,"minterMd5":"21cbd2e538f2b6cc40ee180e174f1e25"},"tokenId":"45ee725c2c5993b3e4d308842d87e973bf1951f5f7a804b21e4dd964ecd12d6b_0","revealTxid":"9a3fcb5a8344f53f2ba580f7d488469346bff9efe7780fbbf8d3490e3a3a0cd7","revealHeight":6540,"genesisTxid":"45ee725c2c5993b3e4d308842d87e973bf1951f5f7a804b21e4dd964ecd12d6b","name":"cat","symbol":"CAT","decimals":2,"minterPubKey":"038b3c42b09f5f36dcf4e1a8dbdcb077324903ea8aeb9d9e4f86c8eb02134277","tokenPubKey":"fdc45725edcc1023ae2a36f5e67485ba1bb1cdc290b92421f629cf1c24c64585"}';

        console.log(tokenInfoParse(tokenStr))

    })
})
;

