import { expect } from "chai";
import { BigNumber, utils } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CustomERC20, WFTM, BaseV1Factory, BaseV1Router01 } from "../typechain";

describe("Solidly", function () {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let wftm: WFTM;
  let alpha: CustomERC20;
  let beta: CustomERC20;
  let solidlyFactory: BaseV1Factory;
  let solidlyRouter: BaseV1Router01;

  beforeEach(async function () {
    // Deploy all contracts
    const WFTMERC20Factory = await ethers.getContractFactory("WFTM", owner);
    wftm = await WFTMERC20Factory.deploy();
    await wftm.deployed();

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

    // deploy the BaseV1Factory
    const BaseV1FactoryFactory = await ethers.getContractFactory("BaseV1Factory");
    solidlyFactory = await BaseV1FactoryFactory.deploy();
    await solidlyFactory.deployed();

    // deploy the BaseV1Router01
    const BaseV1Router01Factory = await ethers.getContractFactory("BaseV1Router01");
    solidlyRouter = await BaseV1Router01Factory.deploy(solidlyFactory.address, wftm.address);
    await solidlyRouter.deployed();
  });

  it("owner should have alpha and beta tokens", async function () {
    expect(await alpha.balanceOf(owner.address)).to.eq(utils.parseEther("10000000"));
    expect(await beta.balanceOf(owner.address)).to.eq(utils.parseEther("10000000"));
  });

  it("owner should create liquidity pair for Alpha and Beta on Uniswap", async function () {
    await alpha.connect(owner).approve(solidlyRouter.address, utils.parseEther("10000000"));
    await beta.connect(owner).approve(solidlyRouter.address, utils.parseEther("10000000"));

    // add liquidity - this also creates pair if non-existent
    await solidlyRouter.connect(owner).addLiquidity(
      alpha.address,
      beta.address,
      false, // stable pair
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      owner.address,
      ethers.constants.MaxUint256
    );

    const pairAddress = await solidlyFactory.getPair(alpha.address, beta.address, false);
    const lpToken: CustomERC20 = await ethers.getContractAt("CustomERC20", pairAddress);
    const lpBalance = await lpToken.balanceOf(owner.address);
    expect(lpBalance).to.eq(BigNumber.from("9999999999999999999000"));
  });

  it("user should create liquidity pair for Alpha and Beta on Uniswap", async function () {
    // mint some tokens to user
    await alpha.connect(owner).mint(user.address, utils.parseEther("1000"));
    await beta.connect(owner).mint(user.address, utils.parseEther("1000"));

    await alpha.connect(user).approve(solidlyRouter.address, utils.parseEther("10000000"));
    await beta.connect(user).approve(solidlyRouter.address, utils.parseEther("10000000"));

    // add liquidity - this also creates pair if non-existent
    await solidlyRouter.connect(user).addLiquidity(
      alpha.address,
      beta.address,
      false, // stable pair
      utils.parseEther("1000"),
      utils.parseEther("1000"),
      utils.parseEther("1000"),
      utils.parseEther("1000"),
      user.address,
      ethers.constants.MaxUint256
    );

    const pairAddress = await solidlyFactory.getPair(alpha.address, beta.address, false);
    const lpToken: CustomERC20 = await ethers.getContractAt("CustomERC20", pairAddress);
    const lpBalance = await lpToken.balanceOf(user.address);
    expect(lpBalance).to.eq(BigNumber.from("999999999999999999000"));
  });

  it("with 10,000 token liquidity, a 1000 token swap produces slippage of ~9%", async function () {
    // mint some tokens to user
    await alpha.mint(user.address, utils.parseEther("1000"));

    // owner approves router to spend tokens
    await alpha.connect(owner).approve(solidlyRouter.address, utils.parseEther("10000000"));
    await beta.connect(owner).approve(solidlyRouter.address, utils.parseEther("10000000"));

    // add liquidity - this also creates pair if non-existent
    // prettier-ignore
    await solidlyRouter.connect(owner).addLiquidity(
      alpha.address,
      beta.address,
      false, // stable pair
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      utils.parseEther("10000"),
      owner.address,
      ethers.constants.MaxUint256
    );

    // user approves router to spend tokens
    await alpha.connect(user).approve(solidlyRouter.address, utils.parseEther("1000"));
    await beta.connect(user).approve(solidlyRouter.address, utils.parseEther("1000"));

    // verify user token Alpha and Beta balances
    expect(await alpha.balanceOf(user.address)).to.eq(utils.parseEther("1000"));
    expect(await beta.balanceOf(user.address)).to.eq(utils.parseEther("0"));

    // check amount of tokens retrievable
    const [_, betaAmountOut] = await solidlyRouter.connect(user).getAmountsOut(
      utils.parseEther("1000"),
      [{ from: alpha.address, to: beta.address, stable: false }],
    );
    expect(betaAmountOut).to.eq(BigNumber.from("909008263711488286257")); // note: uniswap v2 is 906610893880149131581

    // swap tokens
    await solidlyRouter.connect(user).swapExactTokensForTokens(
      utils.parseEther("1000"),
      utils.parseEther("100"),
      [{ from: alpha.address, to: beta.address, stable: false }],
      user.address,
      ethers.constants.MaxUint256
    );

    // utils.formatEther(await alpha.balanceOf(user.address));
    // verify user token Alpha and Beta balances
    expect(await alpha.balanceOf(user.address)).to.eq(utils.parseEther("0"));
    expect(await beta.balanceOf(user.address)).to.eq(BigNumber.from("909008263711488286257"));
    expect(utils.formatEther(await beta.balanceOf(user.address))).to.eq("909.008263711488286257");

    // slippage = (1000 - 909.01) / 1000
    const slippageLoss = (utils.parseEther("1000").sub(BigNumber.from("909008263711488286257")));
    const slippageLossDecimal = +utils.formatEther(slippageLoss);
    const slippageLossPercent = (slippageLossDecimal / 1000) * 100;
    expect(slippageLossDecimal).to.be.eq(90.99173628851172);
    expect(slippageLossPercent.toFixed(3)).to.be.eq("9.099"); // 9.099% lost in slippage
  });
});
