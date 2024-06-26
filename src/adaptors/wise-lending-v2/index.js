const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');
const wiseLendingABI = require('./abi/wiseLendingABI.json');
const wiseSecurityABI = require('./abi/wiseSecurityABI.json');
const superagent = require('superagent');

const ChainName = {
  ethereum: 'Ethereum',
  arbitrum: 'Arbitrum',
};

const contracts = {
  wiseLending: {
    ethereum: "0x78190e4c7C7B2c2C3b0562F1f155a1FC2F5160CA",
    arbitrum: "0x9034a49587bD2c1Af27598E0f04F30Db66C87Ebf"
  },
  wiseSecurity: {
    ethereum: "0x8EB1B69fB74C6019C16f43ae93F0fAD7CCB9A59d",
    arbitrum: "0x67dae107eCF474F0D5B7d8aD45490608a5AdbE2A"
  }
};

const tokenAddresses = {
  ethereum: {
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  },
  arbitrum: {
    WETH: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    USDC: "0x724dc807b04555b71ed48a6896b6F41593b8C637",
    USDT: "0x6ab707Aca953eDAeFBc4fD23bA73294241490620",
    DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    wstETH: "0x5979D7b546E38E414F7E9822514be443A4800529",
  }
};

const projectSlug = 'wise-lending-v2';

const getTokenData = async (chain, token, address, wiseSecurity, wiseLending) => {
  try {

    if (chain === "ethereum") {
      sdk.api.config.setProvider(
        `${chain}`,
        new ethers.providers.JsonRpcProvider(`https://mainnet.infura.io/v3/b2ca877d39fa4a1c99e9120a03d53e57`)
      );
    }

    const tokenAddress = `${chain}:${address[token]}`;

    const usdPrice = (
      await superagent.get(
        `https://coins.llama.fi/prices/current/${tokenAddress}`
      )
    ).body.coins[tokenAddress];

    const lendingData = await sdk.api.abi.call({
      target: wiseSecurity,
      abi: wiseSecurityABI.find((m) => m.name === 'getLendingRate'),
      chain,
      params: [address[token]],
    });

    const lendingRate = lendingData.output / 1e16;

    const borrowData = await sdk.api.abi.call({
      target: wiseSecurity,
      abi: wiseSecurityABI.find((m) => m.name === 'getBorrowRate'),
      chain,
      params: [address[token]],
    });

    const borrowRate = borrowData.output / 1e16;

    const totalBorrowData = await sdk.api.abi.call({
      target: wiseLending,
      abi: wiseLendingABI.find((m) => m.name === 'getPseudoTotalBorrowAmount'),
      chain,
      params: [address[token]],
    });

    const totalBorrow = totalBorrowData.output / Math.pow(10, usdPrice.decimals);

    const totalSupplyData = await sdk.api.abi.call({
      target: wiseLending,
      abi: wiseLendingABI.find((m) => m.name === 'getPseudoTotalPool'),
      chain,
      params: [address[token]],
    });

    const totalSupply = totalSupplyData.output / Math.pow(10, usdPrice.decimals);

    const balanceData = await sdk.api.abi.call({
      target: address[token],
      abi: 'erc20:balanceOf',
      chain,
      params: [wiseLending],
    });

    const balance = balanceData.output / Math.pow(10, usdPrice.decimals);

    const tvlUsd = balance * usdPrice.price;
    const totalSupplyUsd = totalSupply * usdPrice.price;
    const totalBorrowUsd = totalBorrow * usdPrice.price;

    return {
      pool: `${address[token]}-${projectSlug}-${chain}`,
      chain: ChainName[chain],
      project: projectSlug,
      symbol: usdPrice.symbol,
      tvlUsd,
      apyBase: lendingRate,
      // apyReward: lendingRate,
      url: 'https://wiselending.com/',
      apyBaseBorrow: borrowRate,
      // apyRewardBorrow: borrowRate,
      totalSupplyUsd,
      totalBorrowUsd,
    };
  } catch (e) {
    console.log('error', chain, token, address[token], wiseSecurity, wiseLending, e);
  }
};

async function apy() {
  const chains = Object.keys(ChainName);
  const pools = await Promise.all(
    chains.map(async (chain) => {
      const tokens = Object.keys(tokenAddresses[chain]);
      return (
        await Promise.all(
          // Lend Pool
          [
            Promise.all(
              tokens.map(async (token) => {

                return getTokenData(chain, token, tokenAddresses[chain], contracts.wiseSecurity[chain], contracts.wiseLending[chain]);
              })
            ),
          ]
        )
      ).flat();
    }),
  );

  return pools.flat();
}

module.exports = {
  timetravel: false,
  apy: apy,
};
