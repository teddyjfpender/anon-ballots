import { Poseidon, Struct, PublicKey, Group, Scalar, Provable, Field, Experimental, MerkleMapWitness, Nullifier, Bool, UInt64} from 'o1js';

/**
 * Represents a private ballot
 */
export interface AnonBallotType {
    /** 
     * The one-time destination address, derived from a secret and recipient view key. 
     */
    oneTimeAddress: PublicKey;
  
    /** 
     * Transaction public key used in the transaction. Typically denoted as R = r*G. 
     */
    transactionPublicKey: PublicKey;
  
    /** 
     * The weight is the voting power private ballot
     */
    weight: UInt64;
  }

export class AnonBallot extends Struct({
    oneTimeAddress: PublicKey,
    transactionPublicKey: PublicKey,
    weight: UInt64,
  }) implements AnonBallotType {

    /**
     * Constructs a Private Ballot object.
     * @param publicSpendKey - The public spend key of the recipient.
     * @param publicViewKey - The public view key of the recipient.
     */
    constructor(r: Scalar, publicSpendKey: PublicKey, publicViewKey: PublicKey, weight: UInt64) {

      // Generate a random private key for the transaction.
      //const r = Provable.witness(Scalar, () => Scalar.random());
  
      // Compute the public key corresponding to r. This is R = r*G.
      const R = PublicKey.fromGroup(Group.generator.scale(r));
  
      // Compute the ephemeral key F. 
      const F = publicViewKey.toGroup().scale(r);
  
      // Calculate the shared secret ss = H(r*V) = H(v*R).
      const ss = Scalar.from(Poseidon.hash(F.toFields()).toBigInt());
  
      // Derive the one-time destination address, K.
      const K = Group.generator.scale(ss.toBigInt()).add(publicSpendKey.toGroup());
  
      super({
        oneTimeAddress: PublicKey.fromGroup(K),
        transactionPublicKey: R,
        weight: weight,
      });
    }

    /**
     * Convert the Ballot object into its JSON representation.
     * @param ballot - The Ballot object.
     * @returns The JSON string representation of the Ballot.
     */
    toJSON(ballot: AnonBallotType) {
        return {
            oneTimeAddress: PublicKey.toBase58(ballot.oneTimeAddress),
            ephemeralPublicKey: PublicKey.toBase58(ballot.transactionPublicKey),
            amount: ballot.weight.toBigInt().toString(),
        }
    }

    /**
     * Convert a JSON string into a AnonBallotType object.
     * @param ballot - The JSON string representation of the AnonBallotType.
     * @returns The AnonBallotType object.
     */
    fromJSON(ballot: string) {
      const ballotObject = JSON.parse(ballot);
      const oneTimeAddress = PublicKey.fromBase58(ballotObject.oneTimeAddress); 
      const transactionPublicKey = PublicKey.fromBase58(ballotObject.ephemeralPublicKey);
      const weight = UInt64.from(ballotObject.weight);
      return { oneTimeAddress, transactionPublicKey, weight} as AnonBallotType;
    }
}



export class AnonBallotsObject extends Struct({
    ballot_1: AnonBallot,
    ballot_2: AnonBallot,
    ballot_3: AnonBallot
}) {
    /**
     * Constructs a `BallotsObject` object.
     * @param ballots - Array of PrivateBallot objects.
     */
    constructor(ballots: AnonBallot[]) {
        const ballot_1 = ballots[0];
        const ballot_2 = ballots[1];
        const ballot_3 = ballots[2];
        super({ ballot_1, ballot_2, ballot_3 });
    }

}
  

export class BallotCreationOutput extends Struct({
    ballots: AnonBallotsObject,
    root: Field,
    nullifier: Field,
}) {}

export const BallotCreation = Experimental.ZkProgram({
    /** Public outputs of the transaction. */
    publicOutput: BallotCreationOutput,

    methods: {
        create: {
            /** Private inputs used for proving ownership and transaction validity. */
            // unsure if I should use the provable array or just a field?
            privateInputs: [Provable.Array(AnonBallot, 3), MerkleMapWitness, Nullifier, UInt64, Provable.Array(Field, 1)],

            /**
             * 
             */
            method(ballots: AnonBallot[], witness: MerkleMapWitness, nullifier: Nullifier, balance: UInt64, message: Field[]): BallotCreationOutput {
                // need to check that the private input weights sum to the correct balance
                const sum = ballots.reduce((accumulator, ballot) => accumulator.add(ballot.weight), UInt64.from(0));
                sum.assertEquals(balance);
                // 
                const key = Poseidon.hash(nullifier.getPublicKey().toFields());
                const [computedRoot, computedKey] = witness.computeRootAndKey(
                    // value in the ledger balances tree committed to the runtimeMoudle's ledger
                    Poseidon.hash(balance.toFields())
                );
                computedKey.assertEquals(key);

                nullifier.verify(message);
                
                return new BallotCreationOutput({
                    ballots: new AnonBallotsObject(ballots),
                    root: computedRoot,
                    nullifier: nullifier.key(),
                });
            },
        },
    },
});

export class BallotCreationProof extends Experimental.ZkProgram.Proof(BallotCreation) { };