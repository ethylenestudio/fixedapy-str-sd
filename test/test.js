const { expect } = require("chai");
const { ethers, network } = require("hardhat");
let provider = new ethers.getDefaultProvider("http://localhost:8545/");
const abi = require("../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json");

// Strategy Constructor Address
const ANGLE_VAULT_ADDRESS = "0x1BD865ba36A510514d389B2eA763bad5d96b6ff9";
const ANGLE_STRATEGY_ADDRESS = "0x22635427C72e8b0028FeAE1B5e1957508d9D7CAF";
const ONEINCH_ROUTER_ADDRESS = "0x1111111254fb6c44bAC0beD2854e76F90643097d";
const ANGLE_SM_ADDRESS = "0x5adDc89785D75C86aB939E9e15bfBBb7Fc086A87";
const ANGLE_GAUGE_ADDRESS = "0xB6261Be83EA2D58d8dd4a73f3F1A353fa1044Ef7";
const SANFRAX_EUR_ADDRESS = "0xb3B209Bb213A5Da5B947C56f2C770b3E1015f1FE";
const FRAX_ADDRESS = "0x853d955aCEf822Db058eb8505911ED77F175b99e";

// Addresses to be Imprersonated
const SANFRAX_EUR_HOLDER = "0xA2dEe32662F6243dA539bf6A8613F9A9e39843D3"; // Has 100 token
const FRAX_HOLDER = "0x79cC5b81438f72e2261f30602f17f33999db7cf3";

describe("Fixed Strategy Contract", async function () {
  let owner, alice, bob, sanfrax_eur_holder, frax_holder;
  let oneInchContract, oneInch;
  let strategy;
  let sanfrax_eur, frax;

  before(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [SANFRAX_EUR_HOLDER],
    });

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [FRAX_HOLDER],
    });
    sanfrax_eur_holder = await ethers.getSigner(SANFRAX_EUR_HOLDER);
    frax_holder = await ethers.getSigner(FRAX_HOLDER);

    oneInchContract = await ethers.getContractFactory("MockOneInch");
    oneInch = await oneInchContract.deploy();
    await oneInch.deployed();

    const strContract = await ethers.getContractFactory("FixedStrategy");
    strategy = await strContract.deploy(
      ANGLE_VAULT_ADDRESS,
      ANGLE_STRATEGY_ADDRESS,
      oneInch.address, //ONEINCH_ROUTER_ADDRESS != mock for now
      ANGLE_SM_ADDRESS,
      ANGLE_GAUGE_ADDRESS,
      SANFRAX_EUR_ADDRESS
    );
    await strategy.deployed();

    sanfrax_eur = new ethers.Contract(
      SANFRAX_EUR_ADDRESS,
      abi.abi,
      sanfrax_eur_holder
    );

    frax = new ethers.Contract(FRAX_ADDRESS, abi.abi, frax_holder);
  });

  //////////////////////////////////////////

  it("Deploys the contract and checks address values", async function () {
    expect(oneInch.address).to.be.properAddress;
    expect(strategy.address).to.be.properAddress;
    expect(sanfrax_eur.address).to.be.properAddress;
  });

  //////////////////////////////////////////

  it("Sends ether to Impersonate Account & Sends sanfrax to Owner, Alice, Bob", async function () {
    const tx = {
      to: sanfrax_eur_holder.address,
      value: ethers.utils.parseEther("5"),
    };
    await owner.sendTransaction(tx);

    const balanceImp = await sanfrax_eur.balanceOf(sanfrax_eur_holder.address);
    expect(balanceImp).to.equal(ethers.utils.parseEther("100"));

    const transferImp = await sanfrax_eur.transfer(
      owner.address,
      ethers.utils.parseEther("50")
    );
    await transferImp.wait();

    const transferImp2 = await sanfrax_eur.transfer(
      alice.address,
      ethers.utils.parseEther("25")
    );
    await transferImp2.wait();

    const transferImp3 = await sanfrax_eur.transfer(
      bob.address,
      ethers.utils.parseEther("25")
    );
    await transferImp3.wait();

    const balanceOwn = await sanfrax_eur.balanceOf(owner.address);
    expect(balanceOwn).to.equal(ethers.utils.parseEther("50"));

    const balanceAlice = await sanfrax_eur.balanceOf(alice.address);
    expect(balanceAlice).to.equal(ethers.utils.parseEther("25"));

    const balanceBob = await sanfrax_eur.balanceOf(bob.address);
    expect(balanceBob).to.equal(ethers.utils.parseEther("25"));
  });

  //////////////////////////////////////////

  it("Deposits sanToken to contract on behalf of Owner", async function () {
    const approveToken = await sanfrax_eur
      .connect(owner)
      .approve(strategy.address, ethers.utils.parseEther("100"));
    await approveToken.wait();
    const depositFunc = await strategy.deposit(ethers.utils.parseEther("50"));
    await depositFunc.wait();

    const ownerShare = await strategy.userToShare(owner.address);
    expect(ownerShare).to.equal(ethers.utils.parseEther("50"));
  });

  //////////////////////////////////////////

  it("Deposits sanToken to contract on behalf of Alice", async function () {
    const approveToken = await sanfrax_eur
      .connect(alice)
      .approve(strategy.address, ethers.utils.parseEther("100"));
    await approveToken.wait();

    const pricePerShare = await strategy.pricePerShare();
    const depositFunc = await strategy
      .connect(alice)
      .deposit(ethers.utils.parseEther("25"));
    await depositFunc.wait();
    const aliceShare = await strategy.userToShare(alice.address);
    expect(parseInt(ethers.utils.formatEther(aliceShare))).to.equal(
      parseInt(ethers.utils.parseEther("25") / pricePerShare)
    );
  });

  //////////////////////////////////////////

  it("Deposits sanToken to contract on behalf of Bob", async function () {
    const approveToken = await sanfrax_eur
      .connect(bob)
      .approve(strategy.address, ethers.utils.parseEther("100"));
    await approveToken.wait();

    const pricePerShare = await strategy.pricePerShare();
    const depositFunc = await strategy
      .connect(bob)
      .deposit(ethers.utils.parseEther("25"));
    await depositFunc.wait();
    const bobShare = await strategy.userToShare(alice.address);
    expect(parseInt(ethers.utils.formatEther(bobShare))).to.equal(
      parseInt(ethers.utils.parseEther("25") / pricePerShare)
    );
  });

  //////////////////////////////////////////

  it("Deposits contract tokens to StakeDao contract **comp", async function () {
    const prevContractBalance = await sanfrax_eur.balanceOf(strategy.address);
    const prevGaugeBalance = await strategy.getBalanceInGauge();
    const compound = await strategy.comp(true);
    await compound.wait();
    const contractBalance = await sanfrax_eur.balanceOf(strategy.address);
    expect(parseInt(ethers.utils.formatEther(contractBalance))).to.equal(0);

    const gaugeBalance = await strategy.getBalanceInGauge();
    expect(
      parseInt(
        ethers.utils.formatEther(gaugeBalance) -
          ethers.utils.formatEther(prevGaugeBalance)
      )
    ).to.equal(parseInt(ethers.utils.formatEther(prevContractBalance)));

    await network.provider.send("evm_setNextBlockTimestamp", [1665758956]);
    await network.provider.send("evm_mine");
  });

  //////////////////////////////////////////

  it("Owner calls the emergency & Owner withdraws his 50 LP token via emergencyWithdraw", async () => {
    const emergencyToggle = await strategy.toggleEmergency();
    await emergencyToggle.wait();

    const emergencyWithdraw = await strategy.emergencyWithdraw();
    await emergencyWithdraw.wait();

    const emergencyToggle2 = await strategy.toggleEmergency();
    await emergencyToggle2.wait();

    const shareOfOwner = await strategy.userToShare(owner.address);
    expect(shareOfOwner.toString()).to.equal("0");
    const balanceOfOwner = await sanfrax_eur.balanceOf(owner.address);
    expect(ethers.utils.formatEther(balanceOfOwner).toString()).to.equal(
      "50.0"
    );
  });

  //////////////////////////////////////////

  it("Calls the stakeDao harvester to collect Angle rewards", async function () {
    const harvestStake = await strategy.harvestStake();
    await harvestStake.wait();
  });

  /////////////////////////////////////////
  it("Claims rewards from StakeDao gauge - claims angl & sdt to contract", async function () {
    const angl = new ethers.Contract(
      "0x31429d1856aD1377A8A0079410B297e1a9e214c2",
      abi.abi,
      owner
    );
    const sdt = new ethers.Contract(
      "0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F",
      abi.abi,
      owner
    );
    const claimTxn = await strategy.claim();
    await claimTxn.wait();
    const sdtBal = await sdt.balanceOf(strategy.address);
    const anglBal = await angl.balanceOf(strategy.address);
    console.log(
      "sdtBalance is",
      ethers.utils.formatEther(sdtBal).toString(),
      "anglBalance is",
      ethers.utils.formatEther(anglBal).toString(),
      "after >3 months"
    );
  });

  /////////////////////////////////////////

  it("Our contract swaps angl & sdt to frax -> sanfrax", async function () {
    const sendFrax = await frax.transfer(
      oneInch.address,
      ethers.utils.parseEther("1000000")
    );
    await sendFrax.wait();

    const harvestFunc = await strategy.harvest(
      ethers.constants.AddressZero,
      [1, 1],
      ["0x", "0x"],
      ["0x", "0x"]
    );
    await harvestFunc.wait();
    const newBalance = await sanfrax_eur.balanceOf(strategy.address);
    console.log(
      "new LP collected in contract after harvesting ",
      ethers.utils.formatEther(newBalance).toString()
    );
  });

  /////////////////////////////////////////

  it("Reinvests collected LP's in this contract", async () => {
    const reinvest = await strategy.comp(true);
    await reinvest.wait();
    const newPPS = await strategy.pricePerShare();
    console.log(
      "new PPS with the harvest & restake ",
      ethers.utils.formatEther(newPPS)
    );
    console.log(
      "this ensures that staking to stakeDAO or holding in the contract does not affect PPS or withdraw functions on users perspective"
    );
  });

  /////////////////////////////////////////

  it("Alice withdraws some of her funds", async function () {
    const currentPPS = await strategy.pricePerShare();
    const withdrawAlice = await strategy
      .connect(alice)
      .withdraw(ethers.utils.parseEther("10"));
    await withdrawAlice.wait();
    const sanBalanceAlice = await sanfrax_eur.balanceOf(alice.address);
    const remainingShares = await strategy.userToShare(alice.address);
    console.log(
      `Alice entered to the pool with 25 LP tokens at a rate of 1PPS, Alice withdraws 10LP after 3 months with PPS of ${ethers.utils.formatEther(
        currentPPS
      )}, she now owns ${ethers.utils.formatEther(
        sanBalanceAlice
      )} LP tokens + ${ethers.utils.formatEther(remainingShares)} shares.`
    );
  });

  /////////////////////////////////////////

  it("Bob withdraws all of his funds", async function () {
    const currentPPS = await strategy.pricePerShare();
    const currentRatio = await strategy.connect(bob).currentRatioForUser();
    const withdrawBob = await strategy
      .connect(bob)
      .withdraw(ethers.utils.parseEther("25"));
    await withdrawBob.wait();
    const sanBalanceBob = await sanfrax_eur.balanceOf(bob.address);
    const bobShares = await strategy.userToShare(bob.address);

    console.log(
      `Bob entered to the pool with 25 LP tokens at a rate of 1PPS, Bob withdraws 25LP after 3 months with PPS of ${ethers.utils.formatEther(
        currentPPS
      )}, he now owns ${ethers.utils.formatEther(
        sanBalanceBob
      )} LP tokens + ${ethers.utils.formatEther(
        bobShares
      )} shares. Yearly APR was ${currentRatio / 10}% at the time`
    );
  });

  /////////////////////////////////////////

  it("ensure that Bob has 0 shares, total share is reduced by alice & bob", async () => {
    const totalShares = await strategy.totalSupply();

    expect(ethers.utils.formatEther(totalShares).toString()).to.equal("15.0");

    const contractBalance = await strategy.getBalanceInGauge();
    console.log(
      "contract still has ",
      ethers.utils.formatEther(contractBalance),
      "LP tokens"
    );
    const ownerShare = await sanfrax_eur.balanceOf(owner.address);
    console.log(
      "owner rewarded with fees more than +8%/yr which is equal to: ",
      (ethers.utils.formatEther(ownerShare) - 50).toString() //owner received 50 during emergencyWithdraw, which is not fee!
    );
    const emergencySituation = await strategy.emergency();
    console.log(
      `Emergency is ${!emergencySituation ? "closed & safe" : "still open!!!!"}`
    );
  });
});
