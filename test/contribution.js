"use strict";

const FoodCoin = artifacts.require("./FoodCoin.sol");
const Contribution = artifacts.require("./Contribution.sol");
const assert = require('assert');
const testUtils = require("./testutils.js");
const BigNumber = require('bignumber.js');

let contribution;
let foodCoin;

contract('Contribiution', function(accounts) {

    const FOUNDER = "0x0000000000000000000000000000000000000001";
    const NON_FOUNDER = "0x0000000000000000000000000000000000000069";
    const FOUNDER_STAKE = 1000;

    const hours = 3600;
    const weeks = 24 * 7 * hours;
    const years = 52 * weeks;

    const PRICE_RATE_FIRST = 2200;
    const PRICE_RATE_SECOND = 2150;
    const PRICE_RATE_THIRD = 2100;
    const PRICE_RATE_FOURTH = 2050;

    const startDelay = 1 * weeks;
    
    const sss = accounts[9]

    let initalBlockTime;
    let startTime;
    let endTime;

    it('Set startTime as now', (done) => {
      web3.eth.getBlock('latest', (err, result) => {
        initalBlockTime = result.timestamp;
        startTime = initalBlockTime + startDelay;
        endTime = startTime + (4 * weeks);
        done();
      });
    });

    describe('CONTRACT DEPLOYMENT', () => {
        it('Deploy Contribution contracts', async () => {
          contribution = await Contribution.new(startTime, sss);
          foodCoin = FoodCoin.at(await contribution.foodCoin());
        });

        it('Check time initialisation', async () => {
          assert.equal(startTime, await foodCoin.startTime());
          assert.equal(endTime, await foodCoin.endTime());
          assert.equal(startTime, await contribution.startTime());
          assert.equal(endTime, await contribution.endTime());
        });

        it ("preallocated tokens", async () => {
            var balance = await foodCoin.preallocatedBalanceOf(FOUNDER)
            assert.equal(FOUNDER_STAKE, balance);
        });

    });
    

    describe('BEFORE PUBLIC CONTRIBUTION', () => {
        it('Test buying too early', (done) => {
            testUtils.assertThrows(() => {
              return contribution.buy({ from: accounts[0], value: 1000 })
            }).then(async () => {
              var balance = await foodCoin.balanceOf(accounts[0]);
              assert.equal(balance.toNumber(), 0);
              done();
            });
        });

        it ("non-minter can't preallocate tokens", (done) => {
            testUtils.assertThrows(() => {
              return foodCoin.preallocateToken(NON_FOUNDER, FOUNDER_STAKE);
            }).then(async () => {
              var balance = await foodCoin.preallocatedBalanceOf(NON_FOUNDER);
              assert.equal(balance.toNumber(), 0);
              done();
            });
        });
        
        it ("can't unlock preallocated funds", (done) => {
          testUtils.assertThrows(() => {
            return foodCoin.unlockBalance(FOUNDER);
          }).then(async () => {
            var balance = await foodCoin.balanceOf(FOUNDER);
            assert.equal(balance.toNumber(), 0);
            done();
          });
        });
    });

    describe('START OF PUBLIC CONTRIBUTION', () => {
        before('Time travel to startTime', (done) => {
            testUtils.increaseTime(startTime, done);
        });

        it('Test buying in time', async () => {
            await contribution.buy({ from: accounts[0], value: 4000000});
            var balance = await foodCoin.balanceOf(accounts[0]);
            assert.equal(balance.toNumber(), 8800000);
        });

        it('Test halting by non-sss account', (done) => {
            contribution.halt().catch((e) => {
                return contribution.halted();
            }).then((halt) => {
                assert.equal(halt, false);
                done();
            });
        });

        it('Test buying with halted account', (done) => {
            contribution.halt({from: sss}).then(() => {
                contribution.buy({ from: accounts[0], value: 4000000}).catch( () => {
                        contribution.halted().then((halt) => {
                            assert.equal(halt, true);
                            return foodCoin.balanceOf(accounts[0]);
                        }).then((balance) => {
                            assert.equal(balance.toNumber(), 8800000);
                            return contribution.unhalt({from: sss});
                        }).then(() => {
                            return contribution.buy({ from: accounts[0], value: 4000000});
                        }).then(() => {
                            return foodCoin.balanceOf(accounts[0]);
                        }).then((balance) => {
                            assert.equal(balance.toNumber(), 17600000);
                            done();
                        });
                });
            });
        });

        it('Test minting liquid token from non-minter fails', (done) => {
            let balance;
            foodCoin.balanceOf(accounts[0]).then((_balance) => {
                balance = _balance;
            }).then(() => {
                return foodCoin.mintLiquidToken(accounts[1], 1000);
            }).catch(() => {
                return foodCoin.balanceOf(accounts[0]);
            }).then((result) => {
                assert.equal(result.toNumber(), balance);
                done();
            });
        });

        it ("test unlocking too early", (done) => {
            let balance;
            foodCoin.balanceOf(FOUNDER_STAKE).then((_balance) => {
                balance = _balance;
            }).then(() => {
                return foodCoin.unlockBalance(FOUNDER);
            }).catch((reason) => {
                foodCoin.balanceOf(FOUNDER_STAKE).then((result) => {
                    assert.equal(result.toNumber(), balance);
                    done();
                });
            });
        });

        it('Test token transfer too early', (done) => {
            foodCoin.transfer(accounts[1], 1000, {from: accounts[0]}).catch((r) => {
                return foodCoin.balanceOf(accounts[1]).then((result) => {
                    assert.equal(result.toNumber(), 0);
                    done();
                });
            });
        });

        it('Test token transferFrom too early', (done) => {
            foodCoin.approve(accounts[1], 1000).then( () => {
                return foodCoin.allowance(accounts[0], accounts[1], 1000);
            }).then((allowed) => {
                assert.equal(allowed, 1000);
                return foodCoin.transferFrom(accounts[0], accounts[1], 1000, {from: accounts[1]});
            }).catch((r) => {
                return foodCoin.balanceOf(accounts[1]).then((result) => {
                    assert.equal(result.toNumber(), 0);
                    done();
                });
            });
        });
    });

    describe('PAST END OF PUBLIC CONTRIBUTION', () => {
        before('Time travel to endTime', (done) => {
            testUtils.increaseTime(endTime + 1, done);
        });

        it('Test buying too late', (done) => {
          let balance;
          foodCoin.balanceOf(accounts[0]).then((_balance) => {
              balance = _balance;
          }).then( () => {
              return contribution.buy({ from: accounts[0], value: 1000 });
          }).catch(() => {
              return foodCoin.balanceOf(accounts[0]);
          }).then((result) => {
              assert.equal(result.toNumber(), balance);
              done();
          });
        });

        it('Test token transfer in time', async () => {
            let expectedBalance = (await foodCoin.balanceOf(accounts[1])).toNumber() + 1000;
            await foodCoin.transfer(accounts[1], 1000, {from: accounts[0]});
            assert.equal(expectedBalance, await foodCoin.balanceOf(accounts[1]));
        });

        it('Test token transferFrom in time', async () => {
            let expectedBalance = (await foodCoin.balanceOf(accounts[1])).toNumber() + 1000;
            await foodCoin.approve(accounts[1], 1000);

            var allowed = await foodCoin.allowance(accounts[0], accounts[1], 1000);
            assert.equal(allowed, 1000);

            await foodCoin.transfer(accounts[1], 1000, {from: accounts[0]});
            assert.equal(expectedBalance, await foodCoin.balanceOf(accounts[1]));
        });

    });

    describe('AFTER THAWING PERIOD', () => {
        before('Time travel to endTime', (done) => {
            testUtils.increaseTime(endTime + (2 * years * 1.01), done);
        });

        it ("unlock preallocated funds", async () => {
          var balance = await foodCoin.balanceOf(FOUNDER_STAKE);
          assert.equal(0, balance);

          await foodCoin.unlockBalance(FOUNDER);
          balance = await foodCoin.preallocatedBalanceOf(FOUNDER);
          assert.equal(0, balance);

          balance = await foodCoin.balanceOf(FOUNDER);
          assert.equal(FOUNDER_STAKE, balance);
        });
    });

    describe('ADMINISTRATIVE', () => {
        it('Test changing SSS address in Contribution Contract', async () => {
          await contribution.setSSSAddress(accounts[1], { from: sss })
          assert.equal(await contribution.sss(), accounts[1]);
        });

        it("Test changing SSS address in Contribution Contract by non-sss", async () => {
            try {
              await contribution.setSSSAddress(accounts[2]);
            } catch (e) {
              assert.notEqual(await contribution.sss(), accounts[2]);
            }
        });

        it('Test changing minter address in Token Contract', async () => {
            var foodCoin = await FoodCoin.new(startTime, endTime);
            await foodCoin.setMinterAddress(accounts[1]);
            assert.equal(await foodCoin.minter(), accounts[1]);
        });

        it("Test changing minter address in Token Contract by non-sss", async () => {
            try {
              await foodCoin.setMinterAddress(accounts[2]);
            } catch (e) {
              assert.notEqual(await foodCoin.minter(), accounts[2]);
            }
        });

    });
});
