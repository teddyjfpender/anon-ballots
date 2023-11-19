import { TestingAppChain } from "@proto-kit/sdk";
import { UInt64, MerkleMap, Poseidon, MerkleMapWitness, Nullifier, Field, Scalar } from "o1js";
import { Ballots } from "../src/BallotNFT";
import { log } from "@proto-kit/common";
import { KeyPairs, deriveKeyPairs } from "../src/key-derivation/keyDerivation";
import { BallotCreation, AnonBallot } from "../src/provable-program/generatePrivateBallots";
log.setLevel("ERROR");

describe("Ballots", () => {
  let aliceKeyPairs: KeyPairs;
  let mockLedgerTree: MerkleMap;
  let aliceBalance: UInt64;
  let witness: MerkleMapWitness;
  let message: Field[];

  beforeAll(() => {
    const PRIVATE_KEY_0 = "EKE1h2CEeYQxDaPfjSGNNB83tXYSpn3Cqt6B3vLBHuLixZLApCpd"
    //const PRIVATE_KEY_1 = "EKEU31uonuF2rhG5f8KW4hRseqDjpPVysqcfKCKxqvs7x5oRviN1"

    // generate the key pairs
    aliceKeyPairs = deriveKeyPairs(PRIVATE_KEY_0);

    // the mock ledger amount for alice
    aliceBalance = UInt64.from(100);

    // populate the mock ledger tree
    mockLedgerTree = new MerkleMap();
    mockLedgerTree.set(
      // the key is the hash of the public key
      Poseidon.hash(aliceKeyPairs.spendPublicKey.toFields()),
      Poseidon.hash(aliceBalance.toFields())
    );
    // mock ledger tree witness for alice
    witness = mockLedgerTree.getWitness(Poseidon.hash(aliceKeyPairs.spendPublicKey.toFields()));
    // nullifier message
    message = [Field(0)];
  });
  it("should demonstrate how to mint an NFT ballot", async () => {
    const appChain = TestingAppChain.fromRuntime({
      modules: {
        Ballots,
      },
      config: {
        Ballots: {},
      },
    });

    await appChain.start();

    appChain.setSigner(aliceKeyPairs.spendPrivateKey);

    const ballotsRuntime = appChain.runtime.resolve("Ballots");

    // set the ledger root
    console.log("setting the ledger root...")
    const tx1 = await appChain.transaction(aliceKeyPairs.spendPublicKey, () => {
      ballotsRuntime.setCommitment(mockLedgerTree.getRoot());
    }, {nonce: 0});

    await tx1.sign();
    await tx1.send();
    console.log("produced block...")
    const block = await appChain.produceBlock();
    expect(block?.txs[0].status).toBe(true);

    // check that the ledger root is set
    const ledgerRoot = await appChain.query.runtime.Ballots.commitment.get();
    expect(ledgerRoot?.toBigInt()).toBe(mockLedgerTree.getRoot().toBigInt());

    console.log("constructing inputs for ballot creation...")
    // alice creates anon-ballots using the ballot creation proof
    const nullifier = Nullifier.fromJSON(
      Nullifier.createTestNullifier(message, aliceKeyPairs.spendPrivateKey)
    );
    // private tx args (need a better name)
    const ballots = [
      new AnonBallot(Scalar.random(), aliceKeyPairs.spendPublicKey, aliceKeyPairs.viewPublicKey, UInt64.from(30)),
      new AnonBallot(Scalar.random(), aliceKeyPairs.spendPublicKey, aliceKeyPairs.viewPublicKey, UInt64.from(60)),
      new AnonBallot(Scalar.random(), aliceKeyPairs.spendPublicKey, aliceKeyPairs.viewPublicKey, UInt64.from(10))
    ]
    console.log("compiling program...")
    // compile the program
    await BallotCreation.compile();
    console.log("generating proof...")
    const privateBallotCreationProof = await BallotCreation.create(ballots, witness, nullifier, aliceBalance, message);
    
    console.log("minting ballots transaction...")
    // alice mints anon-ballots
    const tx2 = await appChain.transaction(aliceKeyPairs.spendPublicKey, () => {
      ballotsRuntime.generateBallots(privateBallotCreationProof);
    }, {nonce: 1});

    await tx2.sign();
    await tx2.send();

    console.log("producing block...")
    const block2 = await appChain.produceBlock();
    expect(block2?.txs[0].status).toBe(true);

    // check that the anon-ballots have been minted and have the correct weights
    const ballot_1 = await appChain.query.runtime.Ballots.anonBallots.get(privateBallotCreationProof.publicOutput.ballots.ballot_1.oneTimeAddress);
    const ballot_2 = await appChain.query.runtime.Ballots.anonBallots.get(privateBallotCreationProof.publicOutput.ballots.ballot_2.oneTimeAddress);
    const ballot_3 = await appChain.query.runtime.Ballots.anonBallots.get(privateBallotCreationProof.publicOutput.ballots.ballot_3.oneTimeAddress);

    console.log("checking ballot weights...")
    expect(ballot_1?.weight.toBigInt()).toBe(30n);
    expect(ballot_2?.weight.toBigInt()).toBe(60n);
    expect(ballot_3?.weight.toBigInt()).toBe(10n);
  }, 1_000_000);
});


