import {
  parseAbi,
  parseAbiParameters,
  encodeAbiParameters,
  zeroAddress,
  type Address,
} from 'viem';
import type { PoolKey } from './types';
export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);
export const intakeAbi = parseAbi([
  'function priceOf(bytes32,address) view returns (uint256)',
]);
export const permit2Abi = parseAbi([
  'function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)',
  'function approve(address token,address spender,uint160 amount,uint48 expiration)',
]);
export const routerErrors = parseAbi([
  'error ExecutionFailed(uint256 commandIndex,bytes message)',
  'error TransactionDeadlinePassed()',
  'error V4TooLittleReceived(uint256 minAmountOutReceived,uint256 amountReceived)',
  'error V4TooMuchRequested(uint256 maxAmountInRequested,uint256 amountRequested)',
  'error AllowanceExpired(uint256 deadline)',
  'error InsufficientAllowance(uint256 amount)',
  'error Error(string reason)',
]);
export const routerAbi = [
  ...parseAbi([
    'function execute(bytes commands,bytes[] inputs,uint256 deadline) payable',
  ]),
  ...routerErrors,
] as const;
export const quoterAbi = parseAbi([
  'function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)',
]);
export function swapInput(
  pool: PoolKey,
  input: Address,
  amountIn: bigint,
  minOut: bigint,
  extended = false,
) {
  const zeroForOne = input.toLowerCase() === pool.currency0.toLowerCase();
  if (!zeroForOne && input.toLowerCase() !== pool.currency1.toLowerCase())
    throw new Error('Input outside pool');
  const out = zeroForOne ? pool.currency1 : pool.currency0;
  const common = [pool, zeroForOne, amountIn, minOut];
  const tuple = extended
    ? parseAbiParameters(
        '((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)',
      )
    : parseAbiParameters(
        '((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)',
      );
  const params = [
    encodeAbiParameters(tuple, [
      [...common, ...(extended ? [0n] : []), '0x'],
    ] as never),
    encodeAbiParameters(parseAbiParameters('address,uint256'), [
      input,
      amountIn,
    ]),
    encodeAbiParameters(parseAbiParameters('address,uint256'), [out, minOut]),
  ];
  return {
    commands: '0x10' as const,
    inputs: [
      encodeAbiParameters(parseAbiParameters('bytes,bytes[]'), [
        '0x060c0f',
        params,
      ]),
    ],
    value: input === zeroAddress ? amountIn : 0n,
  };
}
