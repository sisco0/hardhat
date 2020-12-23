import { BN } from "ethereumjs-util";
import * as t from "io-ts";

import { InvalidInputError, MethodNotFoundError } from "../errors";
import { rpcQuantity, validateParams } from "../input";
import { HardhatNode } from "../node";
import { numberToRpcQuantity } from "../output";

// tslint:disable only-hardhat-error

export class EvmModule {
  constructor(private readonly _node: HardhatNode) {}

  public async processRequest(
    method: string,
    params: any[] = []
  ): Promise<any> {
    switch (method) {
      case "evm_increaseTime":
        return this._increaseTimeAction(...this._increaseTimeParams(params));

      case "evm_setNextBlockTimestamp":
        return this._setNextBlockTimestampAction(
          ...this._setNextBlockTimestampParams(params)
        );

      case "evm_mine":
        return this._mineAction(...this._mineParams(params));

      case "evm_mineMultiple":
        return this._mineMultipleAction(...this._mineMultipleParams(params));

      case "evm_revert":
        return this._revertAction(...this._revertParams(params));

      case "evm_snapshot":
        return this._snapshotAction(...this._snapshotParams(params));
    }

    throw new MethodNotFoundError(`Method ${method} not found`);
  }

  // evm_setNextBlockTimestamp

  private _setNextBlockTimestampParams(params: any[]): [number] {
    return validateParams(params, t.number);
  }

  private async _setNextBlockTimestampAction(
    timestamp: number
  ): Promise<string> {
    const latestBlock = await this._node.getLatestBlock();
    const increment = new BN(timestamp).sub(
      new BN(latestBlock.header.timestamp)
    );
    if (increment.lte(new BN(0))) {
      throw new InvalidInputError(
        `Timestamp ${timestamp} is lower than previous block's timestamp` +
          ` ${new BN(latestBlock.header.timestamp).toNumber()}`
      );
    }
    await this._node.setNextBlockTimestamp(new BN(timestamp));
    return timestamp.toString();
  }

  // evm_increaseTime

  private _increaseTimeParams(params: any[]): [number] {
    return validateParams(params, t.number);
  }

  private async _increaseTimeAction(increment: number): Promise<string> {
    await this._node.increaseTime(new BN(increment));
    const totalIncrement = await this._node.getTimeIncrement();
    // This RPC call is an exception: it returns a number in decimal
    return totalIncrement.toString();
  }

  // evm_mine

  private _mineParams(params: any[]): [number] {
    if (params.length === 0) {
      params.push(0);
    }
    return validateParams(params, t.number);
  }

  private async _mineAction(timestamp: number): Promise<string> {
    // if timestamp is specified, make sure it is bigger than previous
    // block's timestamp
    if (timestamp !== 0) {
      const latestBlock = await this._node.getLatestBlock();
      const increment = new BN(timestamp).sub(
        new BN(latestBlock.header.timestamp)
      );
      if (increment.lte(new BN(0))) {
        throw new InvalidInputError(
          `Timestamp ${timestamp} is lower than previous block's timestamp` +
            ` ${new BN(latestBlock.header.timestamp).toNumber()}`
        );
      }
    }
    await this._node.mineEmptyBlock(new BN(timestamp));
    return numberToRpcQuantity(0);
  }

  // evm_mineMultiple

  private _mineMultipleParams(params: any[]): [number, number[]] {
    switch (params.length) {
      case 0:
        params.push(0);
      case 1:
        params.push([]);
      default:
        break;
    }
    return validateParams(params, t.number, t.Array);
  }

  private async _mineMultipleAction(
    iterations: number,
    timestamps: number[]
  ): Promise<string> {
    // Assert timestamps are an increasing sequence of numbers, greater
    // than the last block timestamp
    let timestampsBN: BN[] = [];
    if (timestamps.length !== 0) {
      if (timestamps.length > iterations) {
        throw new InvalidInputError(
          `Timestamps array size ${timestamps.length} must be lower than or ` +
            `equal to the number of iterations specified ${iterations}.`
        );
      }
      timestampsBN = timestamps.map((ts) => new BN(ts));
      const latestBlock = await this._node.getLatestBlock();
      const latestBlockTimestampBN = new BN(latestBlock.header.timestamp);
      const increasingSequence = timestampsBN.every((ts, idx, arr) => {
        if (idx === arr.length - 1) {
          return true;
        }
        const tsNext = arr[idx + 1];
        return ts.lt(tsNext);
      });
      if (timestampsBN[0].lte(latestBlockTimestampBN)) {
        throw new InvalidInputError(
          `First timestamp specified ${timestampsBN[0].toNumber()} should be greater ` +
            `than latest block's timestamp ${latestBlockTimestampBN.toNumber()}`
        );
      }
      if (!increasingSequence) {
        throw new InvalidInputError(
          "Timestamps specified must be an increasing sequence"
        );
      }
    }
    if (iterations <= 0) {
      throw new InvalidInputError(
        `Invalid iterations number, it must be greater than 0`
      );
    }
    for (let it = 0; it < iterations; it++) {
      let newBlockTimestampBN: BN = new BN(0);
      if (it < timestampsBN.length) {
        newBlockTimestampBN = timestampsBN[it];
      }
      await this._node.mineEmptyBlock(newBlockTimestampBN);
    }
    return numberToRpcQuantity(0);
  }

  // evm_revert

  private _revertParams(params: any[]): [BN] {
    return validateParams(params, rpcQuantity);
  }

  private async _revertAction(snapshotId: BN): Promise<boolean> {
    return this._node.revertToSnapshot(snapshotId.toNumber());
  }

  // evm_snapshot

  private _snapshotParams(params: any[]): [] {
    return [];
  }

  private async _snapshotAction(): Promise<string> {
    const snapshotId = await this._node.takeSnapshot();
    return numberToRpcQuantity(snapshotId);
  }
}
