import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  parseAbi,
  parseEventLogs,
  zeroAddress
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const FACTORY = process.env.PONS_FACTORY_ADDRESS || '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e';
const RPC = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const EXPLORER = 'https://robinhoodchain.blockscout.com';

const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: 'Blockscout', url: EXPLORER } }
});

const factoryAbi = parseAbi([
  'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
  'struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }',
  'struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }',
  'function launchConfigCount() view returns (uint256)',
  'function getLaunchConfig(uint256 id) view returns (LaunchConfig)',
  'function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)',
  'function launchFee() view returns (uint256)',
  'function maxCreatorTaxBps() view returns (uint16)',
  'function canLaunch(address launcher) view returns (bool)',
  'function launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)',
  'event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)'
]);

function publicClient() {
  return createPublicClient({ chain: robinhood, transport: http(RPC, { timeout: 12_000 }) });
}

function getPrivateKey(required = true) {
  let key = String(process.env.LAUNCHER_PRIVATE_KEY || '').trim();
  if (!key) {
    if (required) throw new Error('LAUNCHER_PRIVATE_KEY is not configured');
    return null;
  }
  if (!key.startsWith('0x')) key = `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('LAUNCHER_PRIVATE_KEY is invalid');
  return key;
}

function launcherAddress() {
  const key = getPrivateKey(false);
  if (key) return privateKeyToAccount(key).address;
  const configured = String(process.env.LAUNCHER_ADDRESS || '').trim();
  return isAddress(configured) ? configured : null;
}

async function resolveLaunchConfig(client) {
  const preferred = process.env.PONS_LAUNCH_CONFIG_ID;
  if (preferred !== undefined && preferred !== '') {
    const id = BigInt(preferred);
    const config = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'getLaunchConfig', args: [id] });
    if (!config.enabled) throw new Error(`Pons launch config ${id} is disabled`);
    return { id, config };
  }

  const count = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'launchConfigCount' });
  for (let id = 0n; id < count; id++) {
    const config = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'getLaunchConfig', args: [id] });
    if (config.enabled) return { id, config };
  }
  throw new Error('Pons has no enabled launch configuration');
}

function normalizeDraft(draft, expectedEconomics, salt) {
  if (!draft?.name || !draft?.symbol || !draft?.logo || !draft?.creatorFeeRecipient) throw new Error('Launch draft is incomplete');
  if (!isAddress(draft.creatorFeeRecipient)) throw new Error('Creator fee wallet is invalid');
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(salt || ''))) throw new Error('Launch salt is invalid');
  return {
    name: String(draft.name).trim().slice(0, 64),
    symbol: String(draft.symbol).trim().replace(/^\$/, '').toUpperCase().slice(0, 12),
    logo: String(draft.logo).trim().slice(0, 500),
    description: String(draft.description || '').trim().slice(0, 500),
    socials: {
      twitter: String(draft.twitter || '').trim().slice(0, 300),
      telegram: String(draft.telegram || '').trim().slice(0, 300),
      discord: String(draft.discord || '').trim().slice(0, 300),
      website: String(draft.website || '').trim().slice(0, 300),
      farcaster: String(draft.farcaster || '').trim().slice(0, 300)
    },
    creatorFeeRecipient: draft.creatorFeeRecipient,
    creatorTaxBps: Number(draft.creatorTaxBps || 0),
    buybackEnabled: Boolean(draft.buybackEnabled),
    expectedEconomics,
    salt
  };
}

export async function getPonsStatus() {
  const client = publicClient();
  const launcher = launcherAddress();
  const { id, config } = await resolveLaunchConfig(client);
  const [launchFee, maxCreatorTaxBps, expectedEconomics, allowed] = await Promise.all([
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'launchFee' }),
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'maxCreatorTaxBps' }),
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'previewLaunchEconomics', args: [id, zeroAddress] }),
    launcher ? client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'canLaunch', args: [launcher] }) : Promise.resolve(null)
  ]);

  return {
    chainId: 4663,
    rpc: RPC,
    factory: FACTORY,
    launcher,
    canLaunch: allowed,
    launchConfigId: id.toString(),
    configEnabled: config.enabled,
    launchFeeWei: launchFee.toString(),
    launchFeeEth: formatEther(launchFee),
    maxCreatorTaxBps: Number(maxCreatorTaxBps),
    expectedEconomics
  };
}

export async function dryRunDraft(draft) {
  try {
    const status = await getPonsStatus();
    const taxOkay = Number(draft.creatorTaxBps || 0) <= status.maxCreatorTaxBps;
    return { ok: taxOkay, status, taxOkay };
  } catch (error) {
    return { ok: false, status: null, error: error.message };
  }
}

// Builds the exact unsigned launchToken transaction for the customer's own wallet to sign.
// The backend never holds keys for this path — it only resolves current on-chain
// parameters (fee, economics, tax cap) and encodes the call.
export async function buildLaunchTransaction(draft, { launchConfigId, salt }) {
  const client = publicClient();
  const id = BigInt(launchConfigId);
  const config = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'getLaunchConfig', args: [id] });
  if (!config.enabled) throw new Error(`Pons launch config ${id} is disabled`);

  const [expectedEconomics, launchFee, maxCreatorTaxBps] = await Promise.all([
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'previewLaunchEconomics', args: [id, zeroAddress] }),
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'launchFee' }),
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'maxCreatorTaxBps' })
  ]);

  if (Number(draft.creatorTaxBps || 0) > Number(maxCreatorTaxBps)) {
    throw new Error(`Creator tax exceeds Pons maximum of ${(Number(maxCreatorTaxBps) / 100).toFixed(2)}%`);
  }

  const params = normalizeDraft(draft, expectedEconomics, salt);
  const data = encodeFunctionData({
    abi: factoryAbi,
    functionName: 'launchToken',
    args: [params, id, zeroAddress]
  });

  return {
    to: FACTORY,
    data,
    value: `0x${launchFee.toString(16)}`,
    chainIdHex: `0x${(4663).toString(16)}`,
    chainName: robinhood.name,
    rpcUrl: RPC,
    explorerUrl: EXPLORER,
    launchFeeEth: formatEther(launchFee)
  };
}

// Single non-blocking receipt check — safe to call repeatedly from client polling.
export async function getReceiptStatus(txHash) {
  const client = publicClient();
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch {
    return { state: 'pending' };
  }
  if (!receipt) return { state: 'pending' };
  if (receipt.status !== 'success') return { state: 'reverted' };

  const events = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, eventName: 'TokenLaunched', strict: false });
  const event = events.find(e => e.eventName === 'TokenLaunched');
  const token = event?.args?.token;
  const curve = event?.args?.curve;
  if (!token) return { state: 'reverted' };
  return { state: 'success', token, curve };
}
