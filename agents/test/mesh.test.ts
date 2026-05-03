// Smoke test for the IncomeMesh factory. Construction-only: confirms the
// 5 agents register, the bus exposes a namespace, the mesh closes cleanly.
//
// End-to-end dispatch is exercised in the Phase C integration test against
// real testnet (gated INTEGRATION=1).

import { describe, expect, it } from 'vitest';
import { JsonRpcProvider, Wallet } from 'ethers';
import { createIncomeMesh } from '../src/mesh.js';
import type { AgentEnv } from '../src/shared.js';

// A throwaway in-process key. We only construct the mesh + close it; we
// never sign anything, never hit testnet. The signer is required by the
// factory because deriveKekFromSigner needs it; the call returns a real
// CryptoKey but no network goes out.
const FAKE_KEY = '0x' + '11'.repeat(32);
const FAKE_ADDR = '0x0000000000000000000000000000000000000000';

function fakeEnv(): AgentEnv {
  // JsonRpcProvider with a never-actually-called URL — the env is
  // typed-equivalent to a real one but we set persist:false so no
  // OG_Log writes are issued.
  const provider = new JsonRpcProvider('http://127.0.0.1:0');
  return {
    signer: new Wallet(FAKE_KEY, provider),
    rpcUrl: 'http://127.0.0.1:0',
    indexerUrl: 'http://127.0.0.1:0',
    routerApiKey: 'sk-fake-not-used-in-construction',
    persist: false, // critical: in-memory adapters only
  };
}

describe('createIncomeMesh', () => {
  it('constructs the mesh with all 5 agents registered', async () => {
    const env = fakeEnv();
    const incomeMesh = await createIncomeMesh({
      env,
      paymentReceiptAddress: FAKE_ADDR,
      meshId: 'test-mesh-1',
    });
    try {
      const roles = incomeMesh.mesh.listAgents().map((a) => a.name);
      expect(roles.sort()).toEqual(['brain', 'closer', 'opener', 'operator', 'strategist']);
      expect(incomeMesh.mesh.meshId).toBe('test-mesh-1');
      expect(incomeMesh.mesh.bus.namespace).toContain('mesh-bus-test-mesh-1');
      expect(incomeMesh.agents.brain.role).toBe('brain');
      expect(incomeMesh.agents.operator.role).toBe('operator');
    } finally {
      await incomeMesh.close();
    }
  });

  it('generates a meshId when none is supplied', async () => {
    const env = fakeEnv();
    const incomeMesh = await createIncomeMesh({ env, paymentReceiptAddress: FAKE_ADDR });
    try {
      expect(incomeMesh.mesh.meshId).toMatch(/^incomeclaw-/);
    } finally {
      await incomeMesh.close();
    }
  });
});
