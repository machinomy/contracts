export default {
  "contract_name": "BasicToken",
  "abi": [
    {
      "constant": true,
      "inputs": [],
      "name": "totalSupply",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "_owner",
          "type": "address"
        }
      ],
      "name": "balanceOf",
      "outputs": [
        {
          "name": "balance",
          "type": "uint256"
        }
      ],
      "payable": false,
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_to",
          "type": "address"
        },
        {
          "name": "_value",
          "type": "uint256"
        }
      ],
      "name": "transfer",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "type": "function"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "name": "to",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "Transfer",
      "type": "event"
    }
  ],
  "unlinked_binary": "0x6060604052341561000f57600080fd5b5b6102218061001f6000396000f300606060405263ffffffff7c010000000000000000000000000000000000000000000000000000000060003504166318160ddd811461005357806370a0823114610078578063a9059cbb146100a9575b600080fd5b341561005e57600080fd5b6100666100df565b60405190815260200160405180910390f35b341561008357600080fd5b610066600160a060020a03600435166100e5565b60405190815260200160405180910390f35b34156100b457600080fd5b6100cb600160a060020a0360043516602435610104565b604051901515815260200160405180910390f35b60005481565b600160a060020a0381166000908152600160205260409020545b919050565b600160a060020a03331660009081526001602052604081205461012d908363ffffffff6101c416565b600160a060020a033381166000908152600160205260408082209390935590851681522054610162908363ffffffff6101db16565b600160a060020a0380851660008181526001602052604090819020939093559133909116907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9085905190815260200160405180910390a35060015b92915050565b6000828211156101d057fe5b508082035b92915050565b6000828201838110156101ea57fe5b8091505b50929150505600a165627a7a72305820ad63889bbfaab03b7885ab8beaf867b337e350f167bfd45b165e0634a06128270029",
  "networks": {},
  "schema_version": "0.0.5",
  "updated_at": 1508949901849
}