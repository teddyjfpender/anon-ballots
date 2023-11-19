import {
  AreProofsEnabled,
  provableMethod,
  ZkProgrammable,
} from "@proto-kit/common";
import {
  RuntimeModule,
  runtimeModule,
  state,
  runtimeMethod,
} from "@proto-kit/module";

import { State, StateMap, assert } from "@proto-kit/protocol";
import { Bool, Field, PublicKey } from "o1js";
import { BallotCreationProof, AnonBallot } from "./provable-program/generatePrivateBallots";


@runtimeModule()
export class Ballots extends RuntimeModule<unknown> {

  // anon ballots are pre-voting, they haven't voted on anything yet
  @state() public anonBallots = StateMap.from<PublicKey, AnonBallot>(PublicKey, AnonBallot);
  // commitment/merkle root of the balances tree
  @state() public commitment = State.from<Field>(Field);
  // nullifiers of the ballots
  @state() public nullifiers = StateMap.from<Field, Bool>(Field, Bool);

  // Set the ledger root (this is the root of a merkle map of all address<>balances)
  @runtimeMethod()
  public setCommitment(root: Field) {
    this.commitment.set(root);
  }
    
  // Private User Ballot
  // Generate three ballots all with unique addresses 
  @runtimeMethod()
  public generateBallots(privateBallotCreationProof: BallotCreationProof) {
    privateBallotCreationProof.verify();
    const commitment = this.commitment.get();
    assert(
      privateBallotCreationProof.publicOutput.root.equals(commitment.value),
      "Ballot creation proof does not contain the correct commitment"
    );
    const isNullifierUsed = this.nullifiers.get(
      privateBallotCreationProof.publicOutput.nullifier
    );

    assert(isNullifierUsed.value.not(), "Nullifier has already been used");

    const publicOutput = privateBallotCreationProof.publicOutput;
    this.anonBallots.set(publicOutput.ballots.ballot_1.oneTimeAddress, publicOutput.ballots.ballot_1);
    this.anonBallots.set(publicOutput.ballots.ballot_2.oneTimeAddress, publicOutput.ballots.ballot_2);
    this.anonBallots.set(publicOutput.ballots.ballot_3.oneTimeAddress, publicOutput.ballots.ballot_3);
    // set the nullifiers
    this.nullifiers.set(publicOutput.nullifier, Bool(true));
  }
}
