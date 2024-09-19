import {CatTxParams, transfer} from "../src/transaction/transfer";
import {AddressType} from "../src/common";
import {feeUtxoParse, tokenUtxoParse} from "../src/utils/paramsUtils";
import {pickLargeFeeUtxo} from "../src/utils/utxo";

describe("cat20", () => {
    test("transfer", async () => {
        const privateKey = "L37qpvGk4vqKd3iBMAvaCNfgVJQKpc6qebKeAVk4BCpc9vy42dW7"

        const tokenMetadata = '{"minterAddr":"bc1pqw9ncs4sna0ndh85ux5dhh9swueyjql23t4em8j0smywkqsngfmsn7gmua","tokenAddr":"bc1plhz9wf0desgz8t32xm67vay9hgdmrnwzjzujgg0k9883cfxxgkzs20qfd5","info":{"max":"21000000","name":"cat","limit":"5","symbol":"CAT","premine":"0","decimals":2,"minterMd5":"21cbd2e538f2b6cc40ee180e174f1e25"},"tokenId":"45ee725c2c5993b3e4d308842d87e973bf1951f5f7a804b21e4dd964ecd12d6b_0","revealTxid":"9a3fcb5a8344f53f2ba580f7d488469346bff9efe7780fbbf8d3490e3a3a0cd7","revealHeight":6540,"genesisTxid":"45ee725c2c5993b3e4d308842d87e973bf1951f5f7a804b21e4dd964ecd12d6b","name":"cat","symbol":"CAT","decimals":2,"minterPubKey":"038b3c42b09f5f36dcf4e1a8dbdcb077324903ea8aeb9d9e4f86c8eb02134277","tokenPubKey":"fdc45725edcc1023ae2a36f5e67485ba1bb1cdc290b92421f629cf1c24c64585"}';

        const tokenInputsStr = `[
          {
            "utxo": {
              "txId": "80ea11690349ddb6b554f2f7be40905d0b2ed4d0ac272b752aa52c3ee5dc6e58",
              "outputIndex": 1,
              "script": "5120fdc45725edcc1023ae2a36f5e67485ba1bb1cdc290b92421f629cf1c24c64585",
              "satoshis": "330"
            },
            "txoStateHashes": [
              "b21d642f5efa4da5070fffdb9b8773f5fdc39fb0",
              "",
              "",
              "",
              ""
            ],
            "state": {
              "address": "83587562c89dd70c0bed2e9c6197b5e598498148",
              "amount": "500"
            }
          },
          {
            "utxo": {
              "txId": "a3a0e6641b3978da3c0b65dd14df7cdfeda499fe4264693db57c78b22e737345",
              "outputIndex": 3,
              "script": "5120fdc45725edcc1023ae2a36f5e67485ba1bb1cdc290b92421f629cf1c24c64585",
              "satoshis": "330"
            },
            "txoStateHashes": [
              "347d6ae4b9998699cf48cf20acfb4d81902b0a13",
              "c04905e7e9d4d4f17e27441fda94b5fbe283a7db",
              "b21d642f5efa4da5070fffdb9b8773f5fdc39fb0",
              "",
              ""
            ],
            "state": {
              "address": "83587562c89dd70c0bed2e9c6197b5e598498148",
              "amount": "500"
            }
          }
        ]`;
        const tokenContracts = tokenUtxoParse(tokenInputsStr)

        const utxoInputsStr = `[
          {
            "txid": "050fd76a622c8965570c310236580672ddd9aad9525a617c65b337412ec0a065",
            "vout": 1,
            "satoshi": 181724336,
            "scriptType": "5120",
            "scriptPk": "5120f0513064fe1e5b5c31bedff43b943f2f1211d14ab2891687241b138d214888e3",
            "codeType": 9,
            "address": "bc1p7pgnqe87red4cvd7ml6rh9pl9ufpr522k2y3dpeyrvfc6g2g3r3s3ae9dr",
            "height": 4194303,
            "idx": 35546,
            "isOpInRBF": false,
            "isSpent": false,
            "inscriptions": []
          },
          {
            "txid": "934677e1b69daea7f4f3fab53e6d9a70103089debf4126e9f0bfb7821864738f",
            "vout": 0,
            "satoshi": 5100000,
            "scriptType": "5120",
            "scriptPk": "5120f0513064fe1e5b5c31bedff43b943f2f1211d14ab2891687241b138d214888e3",
            "codeType": 9,
            "address": "bc1p7pgnqe87red4cvd7ml6rh9pl9ufpr522k2y3dpeyrvfc6g2g3r3s3ae9dr",
            "height": 31577,
            "idx": 2380,
            "isOpInRBF": false,
            "isSpent": false,
            "inscriptions": []
          },
          {
            "txid": "c1083cb00478ebf1e4ec1951319e0f2bc8361aeb5a1b643cba86b31cfaf3b613",
            "vout": 1,
            "satoshi": 33684401,
            "scriptType": "5120",
            "scriptPk": "5120f0513064fe1e5b5c31bedff43b943f2f1211d14ab2891687241b138d214888e3",
            "codeType": 9,
            "address": "bc1p7pgnqe87red4cvd7ml6rh9pl9ufpr522k2y3dpeyrvfc6g2g3r3s3ae9dr",
            "height": 31568,
            "idx": 314,
            "isOpInRBF": false,
            "isSpent": false,
            "inscriptions": []
          }
          ]`;
        const utxos = feeUtxoParse(utxoInputsStr)
        let feeUtxo = pickLargeFeeUtxo(utxos);

        let param: CatTxParams = {
            privateKey: privateKey,
            addressType: AddressType.P2TR,
            data: {
                tokenMetadata: tokenMetadata,
                tokens: tokenContracts,
                feeUtxo: feeUtxo,
                feeRate: 10,
                changeAddress: "bc1pw0cqcrlsgsa778f8nu2thkfxzsrqv0gw6prtrzx6xjrjng8wlv4sa5pfqj",
                receiver: "bc1pw0cqcrlsgsa778f8nu2thkfxzsrqv0gw6prtrzx6xjrjng8wlv4sa5pfqj",
                tokenAmount: 1000,
            }
        }
        transfer(param)


    })
})


