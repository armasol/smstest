import crypto from 'node:crypto';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
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

function normalizeDraft(draft, expectedEconomics) {
  if (!draft?.name || !draft?.symbol || !draft?.logo || !draft?.creatorFeeRecipient) throw new Error('Launch draft is incomplete');
  if (!isAddress(draft.creatorFeeRecipient)) throw new Error('Creator fee wallet is invalid');
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
    salt: `0x${crypto.randomBytes(32).toString('hex')}`
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

export async function launchFromDraft(draft) {
  if (String(process.env.ENABLE_ONCHAIN_LAUNCH || 'false').toLowerCase() !== 'true') {
    throw new Error('Onchain launching is disabled. Set ENABLE_ONCHAIN_LAUNCH=true after testing');
  }

  const key = getPrivateKey(true);
  const account = privateKeyToAccount(key);
  const client = publicClient();
  const walletClient = createWalletClient({ account, chain: robinhood, transport: http(RPC, { timeout: 15_000 }) });
  const { id: launchConfigId, config } = await resolveLaunchConfig(client);

  const [allowed, expectedEconomics, launchFee, maxCreatorTaxBps, balance] = await Promise.all([
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'canLaunch', args: [account.address] }),
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'previewLaunchEconomics', args: [launchConfigId, zeroAddress] }),
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'launchFee' }),
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'maxCreatorTaxBps' }),
    client.getBalance({ address: account.address })
  ]);

  if (!allowed) throw new Error('Pons v2 launch gate rejected the launcher wallet');
  if (!config.enabled) throw new Error(`Pons launch config ${launchConfigId} is disabled`);
  if (Number(draft.creatorTaxBps || 0) > Number(maxCreatorTaxBps)) {
    throw new Error(`Creator tax exceeds Pons maximum of ${(Number(maxCreatorTaxBps) / 100).toFixed(2)}%`);
  }
  if (balance <= launchFee) throw new Error(`Launcher wallet needs more ETH. Launch fee is ${formatEther(launchFee)} ETH plus gas`);

  const params = normalizeDraft(draft, expectedEconomics);
  const simulation = await client.simulateContract({
    account,
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'launchToken',
    args: [params, launchConfigId, zeroAddress],
    value: launchFee
  });

  const hash = await walletClient.writeContract(simulation.request);
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
  if (receipt.status !== 'success') throw new Error('Launch transaction reverted');

  const events = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, eventName: 'TokenLaunched', strict: false });
  const event = events.find(e => e.eventName === 'TokenLaunched');
  const token = event?.args?.token;
  const curve = event?.args?.curve;
  if (!token) throw new Error(`Transaction succeeded but TokenLaunched could not be decoded. Tx: ${hash}`);

  return {
    hash,
    token,
    curve,
    launchConfigId: launchConfigId.toString(),
    explorer: `${EXPLORER}/token/${token}`,
    transaction: `${EXPLORER}/tx/${hash}`
  };
}
