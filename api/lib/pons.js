import crypto from 'node:crypto';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  parseEventLogs,
  zeroAddress
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const FACTORY = process.env.PONS_FACTORY_ADDRESS || '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e';
const RPC = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } }
});

const factoryAbi = parseAbi([
  'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
  'struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }',
  'struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }',
  'function getLaunchConfig(uint256 id) view returns (LaunchConfig)',
  'function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)',
  'function launchFee() view returns (uint256)',
  'function canLaunch(address launcher) view returns (bool)',
  'function launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)',
  'event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)'
]);

function privateKey() {
  let key = process.env.LAUNCHER_PRIVATE_KEY || '';
  if (!key) throw new Error('LAUNCHER_PRIVATE_KEY is not configured');
  if (!key.startsWith('0x')) key = `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('LAUNCHER_PRIVATE_KEY is invalid');
  return key;
}

export async function launchFromProfile({ profile, ticker }) {
  const account = privateKeyToAccount(privateKey());
  const publicClient = createPublicClient({ chain: robinhood, transport: http(RPC) });
  const walletClient = createWalletClient({ account, chain: robinhood, transport: http(RPC) });
  const launchConfigId = BigInt(process.env.PONS_LAUNCH_CONFIG_ID || '0');

  const [allowed, config, expectedEconomics, launchFee] = await Promise.all([
    publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'canLaunch', args: [account.address] }),
    publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'getLaunchConfig', args: [launchConfigId] }),
    publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'previewLaunchEconomics', args: [launchConfigId, zeroAddress] }),
    publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'launchFee' })
  ]);

  if (!allowed) throw new Error('Launcher wallet is not currently approved by the Pons v2 launch gate');
  if (!config.enabled) throw new Error(`Pons launch config ${launchConfigId} is disabled`);

  const recipient = process.env.CREATOR_FEE_RECIPIENT && /^0x[0-9a-fA-F]{40}$/.test(process.env.CREATOR_FEE_RECIPIENT)
    ? process.env.CREATOR_FEE_RECIPIENT
    : zeroAddress;
  const salt = `0x${crypto.randomBytes(32).toString('hex')}`;

  const params = {
    name: (profile.name || profile.username || ticker).slice(0, 64),
    symbol: ticker.slice(0, 10).toUpperCase(),
    logo: profile.profile_image_url || '',
    description: (profile.description || '').slice(0, 500),
    socials: {
      twitter: `https://x.com/${profile.username}`,
      telegram: '',
      discord: '',
      website: profile.url && !profile.url.includes('x.com/') ? profile.url : '',
      farcaster: ''
    },
    creatorFeeRecipient: recipient,
    creatorTaxBps: Number(process.env.CREATOR_TAX_BPS || '0'),
    buybackEnabled: String(process.env.BUYBACK_ENABLED || 'true').toLowerCase() === 'true',
    expectedEconomics,
    salt
  };

  const hash = await walletClient.writeContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'launchToken',
    args: [params, launchConfigId, zeroAddress],
    value: launchFee
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 45_000 });
  if (receipt.status !== 'success') throw new Error('Launch transaction reverted');

  const events = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, eventName: 'TokenLaunched', strict: false });
  const event = events.find(e => e.eventName === 'TokenLaunched');
  const token = event?.args?.token;
  const curve = event?.args?.curve;
  return {
    hash,
    token,
    curve,
    explorer: token ? `https://robinhoodchain.blockscout.com/token/${token}` : `https://robinhoodchain.blockscout.com/tx/${hash}`
  };
}
