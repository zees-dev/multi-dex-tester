# Multi-Dex slippage tester

A simple project which can be used to create tests for Decentralised Exchanges (primarily Uniswap v2 based) and calculate values such as LP tokens retrieved and slippage incurred via DEX token swaps.

Tests (slippage) for the following exchanges have been provided:

- [Uniswap v2](./test/Uniswapv2.test.ts)
- [Solidly](./test/Solidly.test.ts)

Best current slippage: `Solidly`

## Notes

- The Uniswapv2 codebase ([core](https://github.com/Uniswap/v2-core) and [periphery/router](https://github.com/Uniswap/v2-periphery) contracts) has been forked and contracts updated to solidity `v0.8.12`.
- The [Solidly](https://github.com/solidlyexchange/solidly) codebase has also been updated to solidity `v0.8.12`.
- The `Solidly` functions for getting quotes and performing swaps have the same function name as those of Uniswap - but different no. and struct of params - hence the Uniswapv2 interface(s) cannot be used for Solidly contracts.

To support more exchanges, simply import the respective exchange core/factory and router/periphery contracts to the `contracts` folder; then create the respective tests in the [`test/`](./test/) directory.

## Install dependencies

```sh
npm install
```

Compile contracts and typings (typechain):

```sh
npx hardhat compile
```

## Test

```sh
npx hardhat test
```

## TODO

- [ ] Calculate slippage for a range of values
- [ ] Plot graphs of slippage values
- [ ] Integrate [Curve finance](https://curve.fi/), create tests and calculate slippage values for equivalent levels of liquidity
- [ ] Integrate [Platypus finance](https://platypus.finance/), create tests and calculate slippage values for equivalent levels of liquidity
- [ ] Test stable swaps on Solidly
  - solidly is supposed to be vastly superior to Uniswap for stable swaps - potentially as competitive as [Curve](https://curve.fi/) or [platypus](https://platypus.finance/)
