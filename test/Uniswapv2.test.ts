import { expect } from "chai";
import { BigNumber, utils } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CustomERC20, WETH9, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02 } from "../typechain";

describe("Uniswap v2", function () {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let weth: WETH9;
  let alpha: CustomERC20;
  let beta: CustomERC20;
  let uniswapV2Factory: UniswapV2Factory;
  let uniswapV2Router02: UniswapV2Router02;

  beforeEach(async function () {
    // Deploy all contracts
    const WETH9ERC20Factory = await ethers.getContractFactory("WETH9", owner);
    weth = await WETH9ERC20Factory.deploy();
    await weth.deployed();

    const ERC20Factory = await ethers.getContractFactory("CustomERC20");

    // deploy the AlphaERC20
    alpha = await ERC20Factory.deploy("Alpha", "ALPHA");
    await alpha.deployed();

    // deploy the BetaERC20
    beta = await ERC20Factory.deploy("Beta", "BETA");
    await beta.deployed();

    // Set up owner for re-use
    const [_owner, _user] = await ethers.getSigners();
    owner = _owner;
    user = _user;

    // mint some tokens to the owner
    await alpha.mint(owner.address, utils.parseEther("10000000"));
    await beta.mint(owner.address, utils.parseEther("10000000"));

    // deploy the UniswapV2Factory
    const UniswapV2FactoryFactory = await ethers.getContractFactory("UniswapV2Factory");
    uniswapV2Factory = await UniswapV2FactoryFactory.deploy(owner.address);
    await uniswapV2Factory.deployed();

    // deploy the UniswapV2Router02
    const UniswapV2Router02Factory = await ethers.getContractFactory("UniswapV2Router02");
    uniswapV2Router02 = await UniswapV2Router02Factory.deploy(uniswapV2Factory.address, weth.address);
    await uniswapV2Router02.deployed();
  });

  it("owner should have alpha and beta tokens", async function () {
    expect(await alpha.balanceOf(owner.address)).to.eq(utils.parseEther("10000000"));
    expect(await beta.balanceOf(owner.address)).to.eq(utils.parseEther("10000000"));
  });

  it("owner should create liquidity pair for Alpha and Beta on Uniswap", async function () {
    await alpha.connect(owner).approve(uniswapV2Router02.address, utils.parseEther("10000000"));
    await beta.connect(owner).approve(uniswapV2Router02.address, utils.parseEther("10000000"));

    // add liquidity - this also creates pair if non-existent
    await uniswapV2Router02.connect(owner).addLiquidity(
      alpha.address,
      beta.address,
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      owner.address,
      ethers.constants.MaxUint256
    );

    const pairAddress = await uniswapV2Factory.getPair(alpha.address, beta.address);
    const lpToken: CustomERC20 = await ethers.getContractAt("CustomERC20", pairAddress);
    const lpBalance = await lpToken.balanceOf(owner.address);
    expect(lpBalance).to.eq(BigNumber.from("9999999999999999999000"));
  });

  it("user should create liquidity pair for Alpha and Beta on Uniswap", async function () {
    // mint some tokens to user
    await alpha.connect(owner).mint(user.address, utils.parseEther("1000"));
    await beta.connect(owner).mint(user.address, utils.parseEther("1000"));

    await alpha.connect(user).approve(uniswapV2Router02.address, utils.parseEther("10000000"));
    await beta.connect(user).approve(uniswapV2Router02.address, utils.parseEther("10000000"));

    // add liquidity - this also creates pair if non-existent
    await uniswapV2Router02.connect(user).addLiquidity(
      alpha.address,
      beta.address,
      utils.parseEther("1000"),
      utils.parseEther("1000"),
      utils.parseEther("1000"),
      utils.parseEther("1000"),
      user.address,
      ethers.constants.MaxUint256
    );

    const pairAddress = await uniswapV2Factory.getPair(alpha.address, beta.address);
    const lpToken: CustomERC20 = await ethers.getContractAt("CustomERC20", pairAddress);
    const lpBalance = await lpToken.balanceOf(user.address);
    expect(lpBalance).to.eq(BigNumber.from("999999999999999999000"));
  });

  it("user can remove liquidity", async function () {
    // mint some tokens to user
    await alpha.connect(owner).mint(user.address, utils.parseEther("1000"));
    await beta.connect(owner).mint(user.address, utils.parseEther("1000"));

    await alpha.connect(user).approve(uniswapV2Router02.address, utils.parseEther("10000000"));
    await beta.connect(user).approve(uniswapV2Router02.address, utils.parseEther("10000000"));

    // add liquidity - this also creates pair if non-existent
    await uniswapV2Router02.connect(user).addLiquidity(
      alpha.address,
      beta.address,
      utils.parseEther("1000"),
      utils.parseEther("1000"),
      utils.parseEther("1000"),
      utils.parseEther("1000"),
      user.address,
      ethers.constants.MaxUint256
    );

    const pairAddress = await uniswapV2Factory.getPair(alpha.address, beta.address);
    const lpToken: CustomERC20 = await ethers.getContractAt("CustomERC20", pairAddress);
    const lpBalance = await lpToken.balanceOf(user.address);
    expect(lpBalance).to.eq(BigNumber.from("999999999999999999000"));

    // allow user to send funds to router - this is required to burn LP tokens which removes liquidity
    await lpToken.connect(user).approve(uniswapV2Router02.address, utils.parseEther("10000000"));

    // remove liquidity
    await uniswapV2Router02.connect(user).removeLiquidity(
      alpha.address,
      beta.address,
      lpBalance,
      utils.parseEther("100"),
      utils.parseEther("100"),
      user.address,
      ethers.constants.MaxUint256
    );
    expect(await lpToken.balanceOf(user.address)).to.eq(ethers.constants.Zero);
    expect(ethers.utils.formatEther(await alpha.balanceOf(user.address))).to.eq("999.999999999999999");
    expect(ethers.utils.formatEther(await beta.balanceOf(user.address))).to.eq("999.999999999999999");
  });

  it("with 10,000 token liquidity, a 1000 token swap produces slippage of ~9.34%", async function () {
    // mint some tokens to user
    await alpha.mint(user.address, utils.parseEther("1000"));

    // owner approves router to spend tokens
    await alpha.connect(owner).approve(uniswapV2Router02.address, utils.parseEther("10000000"));
    await beta.connect(owner).approve(uniswapV2Router02.address, utils.parseEther("10000000"));

    // add liquidity - this also creates pair if non-existent
    // prettier-ignore
    await uniswapV2Router02.connect(owner).addLiquidity(
      alpha.address,
      beta.address,
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      owner.address,
      ethers.constants.MaxUint256
    );

    // user approves router to spend tokens
    await alpha.connect(user).approve(uniswapV2Router02.address, utils.parseEther("1000"));
    await beta.connect(user).approve(uniswapV2Router02.address, utils.parseEther("1000"));

    // verify user token Alpha and Beta balances
    expect(await alpha.balanceOf(user.address)).to.eq(utils.parseEther("1000"));
    expect(await beta.balanceOf(user.address)).to.eq(utils.parseEther("0"));

    // check amount of tokens retrievable
    const [_, betaAmountOut] = await uniswapV2Router02.connect(user).getAmountsOut(
      utils.parseEther("1000"),
      [alpha.address, beta.address]
    );
    expect(betaAmountOut).to.eq(BigNumber.from("906610893880149131581"));

    // get quote and swap tokens
    await uniswapV2Router02.connect(user).swapExactTokensForTokens(
      utils.parseEther("1000"),
      betaAmountOut,
      [alpha.address, beta.address],
      user.address,
      ethers.constants.MaxUint256
    );

    utils.formatEther(await alpha.balanceOf(user.address));
    // verify user token Alpha and Beta balances
    expect(await alpha.balanceOf(user.address)).to.eq(utils.parseEther("0"));
    expect(await beta.balanceOf(user.address)).to.eq(BigNumber.from("906610893880149131581"));
    expect(utils.formatEther(await beta.balanceOf(user.address))).to.eq("906.610893880149131581");

    // slippage = (1000 - 906.61) / 1000
    const slippageLoss = (utils.parseEther("1000").sub(BigNumber.from("906610893880149131581")));
    const slippageLossDecimal = +utils.formatEther(slippageLoss);
    const slippageLossPercent = (slippageLossDecimal / 1000) * 100;
    expect(slippageLossDecimal).to.be.eq(93.38910611985087);
    expect(slippageLossPercent.toFixed(3)).to.be.eq("9.339"); // 9.339% lost in slippage
  });

  it("user receives swap fees upon removing liquidity", async function () {
    // mint some tokens to user
    await alpha.connect(owner).mint(user.address, utils.parseEther("10000"));
    await beta.connect(owner).mint(user.address, utils.parseEther("10000"));
    expect(ethers.utils.formatEther(await alpha.balanceOf(user.address))).to.eq("10000.0");
    expect(ethers.utils.formatEther(await beta.balanceOf(user.address))).to.eq("10000.0");

    // ERC20 approves user to send tokens to router
    await alpha.connect(user).approve(uniswapV2Router02.address, utils.parseEther("10000000"));
    await beta.connect(user).approve(uniswapV2Router02.address, utils.parseEther("10000000"));

    // add liquidity - this also creates pair if non-existent
    await uniswapV2Router02.connect(user).addLiquidity(
      alpha.address,
      beta.address,
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      user.address,
      ethers.constants.MaxUint256
    );

    // new user swaps tokens; mint (via owner) -> approve -> swap
    const newUser = (await ethers.getSigners())[2];
    await alpha.connect(owner).mint(newUser.address, utils.parseEther("1000")); // mint tokens to new user
    await alpha.connect(newUser).approve(uniswapV2Router02.address, utils.parseEther("10000000")); // approve tokens for new user
    const [alphaAmountIn, betaAmountOut] = await uniswapV2Router02.connect(newUser).getAmountsOut(
      utils.parseEther("1000"),
      [alpha.address, beta.address],
    );
    expect(ethers.utils.formatEther(betaAmountOut)).to.eq("906.610893880149131581");
    await uniswapV2Router02.connect(newUser).swapExactTokensForTokens(
      utils.parseEther("1000"),
      betaAmountOut,
      [alpha.address, beta.address],
      user.address,
      ethers.constants.MaxUint256
    );
    expect(await alpha.balanceOf(newUser.address)).to.eq(ethers.constants.Zero);
    expect(await beta.balanceOf(newUser.address)).to.eq(ethers.constants.Zero);

    const pairAddress = await uniswapV2Factory.getPair(alpha.address, beta.address);
    const lpToken: UniswapV2Pair = await ethers.getContractAt("UniswapV2Pair", pairAddress);
    const lpBalance = await lpToken.balanceOf(user.address);

    // allow user to send funds to router - this is required to burn LP tokens which removes liquidity
    await lpToken.connect(user).approve(uniswapV2Router02.address, utils.parseEther("10000000"));

    const [r0, r1, __] = await lpToken.getReserves();
    expect(r0).to.eq(utils.parseEther("10000").add(alphaAmountIn));
    expect(r1).to.eq(utils.parseEther("10000").sub(betaAmountOut));

    // remove liquidity
    await uniswapV2Router02.connect(user).removeLiquidity(
      alpha.address,
      beta.address,
      lpBalance,
      r0.sub(utils.parseEther("1")),
      r1.sub(utils.parseEther("1")),
      user.address,
      ethers.constants.MaxUint256
    );
    expect(await lpToken.balanceOf(user.address)).to.eq(ethers.constants.Zero);
    expect(ethers.utils.formatEther(await alpha.balanceOf(user.address))).to.eq("10999.9999999999999989");
    expect(ethers.utils.formatEther(await beta.balanceOf(user.address))).to.eq("9999.99999999999999909");
  });
});
