import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import * as RD from '@devexperts/remote-data-ts'
import { PoolData } from '@thorchain/asgardex-util'
import { Address } from '@xchainjs/xchain-client'
import {
  Asset,
  AssetRuneNative,
  baseAmount,
  BaseAmount,
  baseToAsset,
  Chain,
  formatAssetAmountCurrency
} from '@xchainjs/xchain-util'
import { Col } from 'antd'
import BigNumber from 'bignumber.js'
import * as FP from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { useObservableState } from 'observable-hooks'
import { useIntl } from 'react-intl'
import * as RxOp from 'rxjs/operators'

import { Network } from '../../../../shared/api/types'
import { ZERO_BASE_AMOUNT } from '../../../const'
import {
  convertBaseAmountDecimal,
  getEthTokenAddress,
  isEthAsset,
  isEthTokenAsset,
  max1e8BaseAmount,
  THORCHAIN_DECIMAL
} from '../../../helpers/assetHelper'
import { getChainAsset, isEthChain } from '../../../helpers/chainHelper'
import { eqBaseAmount, eqOAsset, eqOApproveParams, eqOString } from '../../../helpers/fp/eq'
import { sequenceSOption, sequenceTOption } from '../../../helpers/fpHelpers'
import * as PoolHelpers from '../../../helpers/poolHelper'
import { liveData, LiveData } from '../../../helpers/rx/liveData'
import { FundsCap } from '../../../hooks/useFundsCap'
import { useSubscriptionState } from '../../../hooks/useSubscriptionState'
import { INITIAL_SYM_DEPOSIT_STATE } from '../../../services/chain/const'
import { getZeroSymDepositFees } from '../../../services/chain/fees'
import {
  SymDepositMemo,
  SymDepositState,
  SymDepositParams,
  SymDepositStateHandler,
  SymDepositFees,
  FeeRD,
  ReloadSymDepositFeesHandler,
  SymDepositFeesHandler,
  SymDepositFeesRD
} from '../../../services/chain/types'
import { ApproveFeeHandler, ApproveParams, IsApprovedRD, LoadApproveFeeHandler } from '../../../services/ethereum/types'
import { PoolAddress, PoolsDataMap } from '../../../services/midgard/types'
import { ApiError, TxHashLD, TxHashRD, ValidatePasswordHandler } from '../../../services/wallet/types'
import { AssetWithDecimal } from '../../../types/asgardex'
import { WalletBalances } from '../../../types/wallet'
import { PasswordModal } from '../../modal/password'
import { TxModal } from '../../modal/tx'
import { DepositAssets } from '../../modal/tx/extra'
import { ViewTxButton } from '../../uielements/button'
import { Fees, UIFeesRD } from '../../uielements/fees'
import { formatFee } from '../../uielements/fees/Fees.helper'
import * as Helper from './Deposit.helper'
import * as Styled from './Deposit.style'

export type Props = {
  asset: AssetWithDecimal
  assetPrice: BigNumber
  assetBalance: O.Option<BaseAmount>
  runePrice: BigNumber
  runeBalance: O.Option<BaseAmount>
  chainAssetBalance: O.Option<BaseAmount>
  poolAddress: O.Option<PoolAddress>
  memos: O.Option<SymDepositMemo>
  priceAsset?: Asset
  reloadFees: ReloadSymDepositFeesHandler
  fees$: SymDepositFeesHandler
  reloadApproveFee: LoadApproveFeeHandler
  approveFee$: ApproveFeeHandler
  reloadBalances: FP.Lazy<void>
  reloadShares: (delay?: number) => void
  reloadSelectedPoolDetail: (delay?: number) => void
  viewAssetTx: (txHash: string) => void
  viewRuneTx: (txHash: string) => void
  validatePassword$: ValidatePasswordHandler
  balances: WalletBalances
  onChangeAsset: (asset: Asset) => void
  disabled?: boolean
  poolData: PoolData
  deposit$: SymDepositStateHandler
  network: Network
  approveERC20Token$: (params: ApproveParams) => TxHashLD
  isApprovedERC20Token$: (params: ApproveParams) => LiveData<ApiError, boolean>
  fundsCap: O.Option<FundsCap>
  poolsData: PoolsDataMap
  haltedChains: Chain[]
}

type SelectedInput = 'asset' | 'rune' | 'none'

export const SymDeposit: React.FC<Props> = (props) => {
  const {
    asset: { asset, decimal: assetDecimal },
    assetPrice,
    assetBalance: oAssetBalance,
    runePrice,
    runeBalance: oRuneBalance,
    chainAssetBalance: oChainAssetBalance,
    memos: oMemos,
    poolAddress: oPoolAddress,
    viewAssetTx = (_) => {},
    viewRuneTx = (_) => {},
    validatePassword$,
    balances,
    priceAsset,
    reloadFees,
    reloadBalances,
    reloadShares,
    reloadSelectedPoolDetail,
    fees$,
    onChangeAsset,
    disabled = false,
    poolData,
    deposit$,
    network,
    isApprovedERC20Token$,
    approveERC20Token$,
    reloadApproveFee,
    approveFee$,
    fundsCap: oFundsCap,
    poolsData,
    haltedChains
  } = props

  const intl = useIntl()

  const prevAsset = useRef<O.Option<Asset>>(O.none)

  /** Asset balance based on original decimal */
  const assetBalance: BaseAmount = useMemo(
    () =>
      FP.pipe(
        oAssetBalance,
        O.getOrElse(() => baseAmount(0, assetDecimal))
      ),
    [assetDecimal, oAssetBalance]
  )

  const isChainHalted = useMemo(() => PoolHelpers.isChainHalted(haltedChains), [haltedChains])

  const haltedChain = useMemo(() => isChainHalted(asset.chain), [asset, isChainHalted])

  const assetBalanceMax1e8: BaseAmount = useMemo(() => max1e8BaseAmount(assetBalance), [assetBalance])

  const [runeAmountToDeposit, setRuneAmountToDeposit] = useState<BaseAmount>(baseAmount(0, THORCHAIN_DECIMAL))

  const initialAssetAmountToDepositMax1e8 = useMemo(
    () => baseAmount(0, assetBalanceMax1e8.decimal),
    [assetBalanceMax1e8.decimal]
  )

  const [
    /* max. 1e8 decimal */
    assetAmountToDepositMax1e8,
    _setAssetAmountToDepositMax1e8 /* private, never set it directly, use `setAssetAmountToDeposit` instead */
  ] = useState<BaseAmount>(initialAssetAmountToDepositMax1e8)

  const isZeroAmountToDeposit = useMemo(
    () => assetAmountToDepositMax1e8.amount().isZero() || runeAmountToDeposit.amount().isZero(),
    [assetAmountToDepositMax1e8, runeAmountToDeposit]
  )

  const [percentValueToDeposit, setPercentValueToDeposit] = useState(0)

  const [selectedInput, setSelectedInput] = useState<SelectedInput>('none')

  const {
    state: depositState,
    reset: resetDepositState,
    subscribe: subscribeDepositState
  } = useSubscriptionState<SymDepositState>(INITIAL_SYM_DEPOSIT_STATE)

  // Deposit start time
  const [depositStartTime, setDepositStartTime] = useState<number>(0)

  const runeBalance: BaseAmount = useMemo(
    () =>
      FP.pipe(
        oRuneBalance,
        O.getOrElse(() => ZERO_BASE_AMOUNT)
      ),
    [oRuneBalance]
  )

  const chainAssetBalance: BaseAmount = useMemo(
    () =>
      FP.pipe(
        oChainAssetBalance,
        O.getOrElse(() => ZERO_BASE_AMOUNT)
      ),
    [oChainAssetBalance]
  )

  const oDepositParams: O.Option<SymDepositParams> = useMemo(
    () =>
      FP.pipe(
        sequenceSOption({ poolAddress: oPoolAddress, memos: oMemos }),
        O.map(({ poolAddress, memos }) => ({
          asset,
          poolAddress,
          amounts: {
            rune: runeAmountToDeposit,
            // Decimal needs to be converted back for using orginal decimal of this asset (provided by `assetBalance`)
            asset: convertBaseAmountDecimal(assetAmountToDepositMax1e8, assetDecimal)
          },
          memos
        }))
      ),
    [oPoolAddress, oMemos, asset, runeAmountToDeposit, assetAmountToDepositMax1e8, assetDecimal]
  )

  const oApproveParams: O.Option<ApproveParams> = useMemo(() => {
    const oRouterAddress: O.Option<Address> = FP.pipe(
      oPoolAddress,
      O.chain(({ router }) => router)
    )
    const oTokenAddress: O.Option<string> = getEthTokenAddress(asset)
    return FP.pipe(
      sequenceTOption(oTokenAddress, oRouterAddress),
      O.map(([tokenAddress, routerAddress]) => ({
        spender: routerAddress,
        sender: tokenAddress
      }))
    )
  }, [oPoolAddress, asset])

  const zeroDepositFees: SymDepositFees = useMemo(() => getZeroSymDepositFees(asset), [asset])

  const prevDepositFees = useRef<O.Option<SymDepositFees>>(O.none)

  const [depositFeesRD] = useObservableState<SymDepositFeesRD>(
    () =>
      FP.pipe(
        fees$(asset),
        liveData.map((fees) => {
          // store every successfully loaded fees
          prevDepositFees.current = O.some(fees)
          return fees
        })
      ),
    RD.success(zeroDepositFees)
  )

  const depositFees: SymDepositFees = useMemo(
    () =>
      FP.pipe(
        depositFeesRD,
        RD.toOption,
        O.alt(() => prevDepositFees.current),
        O.getOrElse(() => zeroDepositFees)
      ),
    [depositFeesRD, zeroDepositFees]
  )

  const reloadFeesHandler = useCallback(() => {
    reloadFees(asset)
  }, [asset, reloadFees])

  const prevApproveFee = useRef<O.Option<BaseAmount>>(O.none)

  const [approveFeeRD, approveFeesParamsUpdated] = useObservableState<FeeRD, ApproveParams>((approveFeeParam$) => {
    return approveFeeParam$.pipe(
      RxOp.switchMap((params) =>
        FP.pipe(
          approveFee$(params),
          liveData.map((fee) => {
            // store every successfully loaded fees
            prevApproveFee.current = O.some(fee)
            return fee
          })
        )
      )
    )
  }, RD.initial)

  const prevApproveParams = useRef<O.Option<ApproveParams>>(O.none)

  const approveFee: BaseAmount = useMemo(
    () =>
      FP.pipe(
        approveFeeRD,
        RD.toOption,
        O.alt(() => prevApproveFee.current),
        O.getOrElse(() => ZERO_BASE_AMOUNT)
      ),
    [approveFeeRD]
  )

  // Update `approveFeesRD` whenever `oApproveParams` has been changed
  useEffect(() => {
    FP.pipe(
      oApproveParams,
      // Do nothing if prev. and current router a the same
      O.filter((params) => !eqOApproveParams.equals(O.some(params), prevApproveParams.current)),
      // update ref
      O.map((params) => {
        prevApproveParams.current = O.some(params)
        return params
      }),
      // Trigger update for `approveFeesRD`
      O.map(approveFeesParamsUpdated)
    )
  }, [approveFeesParamsUpdated, oApproveParams, oPoolAddress])

  const reloadApproveFeesHandler = useCallback(() => {
    FP.pipe(oApproveParams, O.map(reloadApproveFee))
  }, [oApproveParams, reloadApproveFee])

  const minAssetAmountToDepositMax1e8: BaseAmount = useMemo(
    () => Helper.minAssetAmountToDepositMax1e8({ fees: depositFees.asset, asset, assetDecimal, poolsData }),
    [asset, assetDecimal, depositFees.asset, poolsData]
  )

  const minAssetAmountError = useMemo(() => {
    if (isZeroAmountToDeposit) return false

    return assetAmountToDepositMax1e8.lt(minAssetAmountToDepositMax1e8)
  }, [assetAmountToDepositMax1e8, isZeroAmountToDeposit, minAssetAmountToDepositMax1e8])

  const minRuneAmountToDeposit: BaseAmount = useMemo(
    () => Helper.minRuneAmountToDeposit(depositFees.rune),
    [depositFees.rune]
  )

  const minRuneAmountError = useMemo(() => {
    if (isZeroAmountToDeposit) return false

    return runeAmountToDeposit.lt(minRuneAmountToDeposit)
  }, [isZeroAmountToDeposit, minRuneAmountToDeposit, runeAmountToDeposit])

  const maxRuneAmountToDeposit = useMemo(
    (): BaseAmount => Helper.maxRuneAmountToDeposit({ poolData, runeBalance, assetBalance }),

    [assetBalance, poolData, runeBalance]
  )

  // Update `runeAmountToDeposit` if `maxRuneAmountToDeposit` has been updated
  useEffect(() => {
    if (maxRuneAmountToDeposit.amount().isLessThan(runeAmountToDeposit.amount())) {
      setRuneAmountToDeposit(maxRuneAmountToDeposit)
    }
  }, [maxRuneAmountToDeposit, runeAmountToDeposit])

  /**
   * Max asset amount to deposit
   * Note: It's max. 1e8 decimal based
   */
  const maxAssetAmountToDepositMax1e8 = useMemo((): BaseAmount => {
    const maxAmount = Helper.maxAssetAmountToDeposit({ poolData, runeBalance, assetBalance })
    return max1e8BaseAmount(maxAmount)
  }, [assetBalance, poolData, runeBalance])

  const setAssetAmountToDepositMax1e8 = useCallback(
    (amountToDeposit: BaseAmount) => {
      const newAmount = baseAmount(amountToDeposit.amount(), assetBalanceMax1e8.decimal)

      // dirty check - do nothing if prev. and next amounts are equal
      if (eqBaseAmount.equals(newAmount, assetAmountToDepositMax1e8)) return {}

      const newAmountToDepositMax1e8 = newAmount.amount().isGreaterThan(maxAssetAmountToDepositMax1e8.amount())
        ? maxAssetAmountToDepositMax1e8
        : newAmount

      _setAssetAmountToDepositMax1e8({ ...newAmountToDepositMax1e8 })
    },
    [assetAmountToDepositMax1e8, assetBalanceMax1e8.decimal, maxAssetAmountToDepositMax1e8]
  )

  // Update `assetAmountToDeposit` if `maxAssetAmountToDeposit` has been updated
  useEffect(() => {
    if (maxAssetAmountToDepositMax1e8.amount().isLessThan(assetAmountToDepositMax1e8.amount())) {
      setAssetAmountToDepositMax1e8(maxAssetAmountToDepositMax1e8)
    }
  }, [assetAmountToDepositMax1e8, maxAssetAmountToDepositMax1e8, setAssetAmountToDepositMax1e8])

  const hasAssetBalance = useMemo(() => assetBalance.amount().isGreaterThan(0), [assetBalance])
  const hasRuneBalance = useMemo(() => runeBalance.amount().isGreaterThan(0), [runeBalance])

  const isBalanceError = useMemo(() => !hasAssetBalance && !hasRuneBalance, [hasAssetBalance, hasRuneBalance])

  const showBalanceError = useMemo(
    () =>
      // Note:
      // To avoid flickering of balance error for a short time at the beginning
      // We never show error if balances are not available
      O.isSome(oAssetBalance) && isBalanceError,
    [isBalanceError, oAssetBalance]
  )

  const renderBalanceError = useMemo(() => {
    const noAssetBalancesMsg = intl.formatMessage(
      { id: 'deposit.add.error.nobalance1' },
      {
        asset: asset.ticker
      }
    )

    const noRuneBalancesMsg = intl.formatMessage(
      { id: 'deposit.add.error.nobalance1' },
      {
        asset: AssetRuneNative.ticker
      }
    )

    const noRuneAndAssetBalancesMsg = intl.formatMessage(
      { id: 'deposit.add.error.nobalance2' },
      {
        asset1: asset.ticker,
        asset2: AssetRuneNative.ticker
      }
    )

    const msg =
      // no balance for pool asset and rune
      !hasAssetBalance && !hasRuneBalance
        ? noRuneAndAssetBalancesMsg
        : // no rune balance
        !hasRuneBalance
        ? noRuneBalancesMsg
        : // no balance of pool asset
          noAssetBalancesMsg

    const title = intl.formatMessage({ id: 'deposit.add.error.nobalances' })

    return <Styled.BalanceAlert type="warning" message={title} description={msg} />
  }, [asset.ticker, hasAssetBalance, hasRuneBalance, intl])

  const runeAmountChangeHandler = useCallback(
    (runeInput: BaseAmount) => {
      // Do nothing if we don't entered input for rune
      if (selectedInput !== 'rune') return

      let runeAmount = runeInput.amount().isGreaterThan(maxRuneAmountToDeposit.amount())
        ? { ...maxRuneAmountToDeposit } // Use copy to avoid missmatch with values in input fields
        : runeInput
      // assetAmount max. 1e8 decimal
      const assetAmountMax1e8 = Helper.getAssetAmountToDeposit({
        runeAmount: runeAmount,
        poolData,
        assetDecimal
      })

      if (assetAmountMax1e8.amount().isGreaterThan(maxAssetAmountToDepositMax1e8.amount())) {
        runeAmount = Helper.getRuneAmountToDeposit(maxAssetAmountToDepositMax1e8, poolData)
        setRuneAmountToDeposit(runeAmount)
        setAssetAmountToDepositMax1e8(maxAssetAmountToDepositMax1e8)
        setPercentValueToDeposit(100)
      } else {
        setRuneAmountToDeposit(runeAmount)
        setAssetAmountToDepositMax1e8(assetAmountMax1e8)
        // formula: runeQuantity * 100 / maxRuneAmountToDeposit
        const percentToDeposit = maxRuneAmountToDeposit.amount().isGreaterThan(0)
          ? runeAmount.amount().multipliedBy(100).dividedBy(maxRuneAmountToDeposit.amount()).toNumber()
          : 0
        setPercentValueToDeposit(percentToDeposit)
      }
    },
    [
      assetDecimal,
      maxAssetAmountToDepositMax1e8,
      maxRuneAmountToDeposit,
      poolData,
      selectedInput,
      setAssetAmountToDepositMax1e8
    ]
  )

  const assetAmountChangeHandler = useCallback(
    (assetInput: BaseAmount) => {
      // make sure we use correct decimal based on assetBalanceForThorchain
      // (input's decimal might not be updated yet)
      const newAmountMax1e8 = convertBaseAmountDecimal(assetInput, assetBalanceMax1e8.decimal)
      // Do nothing if we don't entered input for asset
      if (selectedInput !== 'asset') return

      let assetAmountMax1e8 = newAmountMax1e8.amount().isGreaterThan(maxAssetAmountToDepositMax1e8.amount())
        ? { ...maxAssetAmountToDepositMax1e8 } // Use copy to avoid missmatch with values in input fields
        : { ...newAmountMax1e8 }
      const runeAmount = Helper.getRuneAmountToDeposit(assetAmountMax1e8, poolData)

      if (runeAmount.amount().isGreaterThan(maxRuneAmountToDeposit.amount())) {
        assetAmountMax1e8 = Helper.getAssetAmountToDeposit({
          runeAmount,
          poolData,
          assetDecimal
        })
        setRuneAmountToDeposit(maxRuneAmountToDeposit)
        setAssetAmountToDepositMax1e8(assetAmountMax1e8)
        setPercentValueToDeposit(100)
      } else {
        setRuneAmountToDeposit(runeAmount)
        setAssetAmountToDepositMax1e8(assetAmountMax1e8)
        // assetQuantity * 100 / maxAssetAmountToDeposit
        const percentToDeposit = maxAssetAmountToDepositMax1e8.amount().isGreaterThan(0)
          ? assetAmountMax1e8.amount().multipliedBy(100).dividedBy(maxAssetAmountToDepositMax1e8.amount()).toNumber()
          : 0
        setPercentValueToDeposit(percentToDeposit)
      }
    },
    [
      assetBalanceMax1e8.decimal,
      assetDecimal,
      maxAssetAmountToDepositMax1e8,
      maxRuneAmountToDeposit,
      poolData,
      selectedInput,
      setAssetAmountToDepositMax1e8
    ]
  )

  const changePercentHandler = useCallback(
    (percent: number) => {
      const runeAmountBN = maxRuneAmountToDeposit
        .amount()
        .dividedBy(100)
        .multipliedBy(percent)
        .decimalPlaces(0, BigNumber.ROUND_DOWN)
      const assetAmountMax1e8BN = maxAssetAmountToDepositMax1e8
        .amount()
        .dividedBy(100)
        .multipliedBy(percent)
        .decimalPlaces(0, BigNumber.ROUND_DOWN)

      setRuneAmountToDeposit(baseAmount(runeAmountBN, maxRuneAmountToDeposit.decimal))
      setAssetAmountToDepositMax1e8(baseAmount(assetAmountMax1e8BN, assetBalanceMax1e8.decimal))
      setPercentValueToDeposit(percent)
    },
    [assetBalanceMax1e8.decimal, maxAssetAmountToDepositMax1e8, maxRuneAmountToDeposit, setAssetAmountToDepositMax1e8]
  )

  const onChangeAssetHandler = useCallback(
    (asset: Asset) => {
      onChangeAsset(asset)
    },
    [onChangeAsset]
  )

  const onAfterSliderChangeHandler = useCallback(() => {
    if (selectedInput === 'none') {
      reloadFeesHandler()
    }
  }, [reloadFeesHandler, selectedInput])

  const [showPasswordModal, setShowPasswordModal] = useState(false)

  const confirmDepositHandler = useCallback(() => {
    setShowPasswordModal(true)
  }, [setShowPasswordModal])

  const renderFeeError = useCallback(
    (fee: BaseAmount, amount: BaseAmount, asset: Asset) => {
      const msg = intl.formatMessage(
        { id: 'deposit.add.error.chainFeeNotCovered' },
        {
          fee: formatFee({ amount: fee, asset }),
          balance: formatAssetAmountCurrency({ amount: baseToAsset(amount), asset, trimZeros: true })
        }
      )

      return <Styled.FeeErrorLabel>{msg}</Styled.FeeErrorLabel>
    },
    [intl]
  )

  const isThorchainFeeError = useMemo(() => {
    // ignore error check by having zero amounts
    if (isZeroAmountToDeposit) return false

    return FP.pipe(
      oRuneBalance,
      O.fold(
        () => true,
        (balance) => FP.pipe(depositFees.rune, Helper.minBalanceToDeposit, balance.lt)
      )
    )
  }, [isZeroAmountToDeposit, oRuneBalance, depositFees.rune])

  const renderThorchainFeeError = useMemo(() => {
    if (!isThorchainFeeError || isBalanceError /* Don't render anything in case of fees or balance errors */)
      return <></>

    return renderFeeError(Helper.minBalanceToDeposit(depositFees.rune), runeBalance, AssetRuneNative)
  }, [depositFees.rune, isBalanceError, isThorchainFeeError, renderFeeError, runeBalance])

  const isAssetChainFeeError = useMemo(() => {
    // ignore error check by having zero amounts
    if (isZeroAmountToDeposit) return false

    return FP.pipe(
      oChainAssetBalance,
      O.fold(
        () => true,
        (balance) => FP.pipe(depositFees.asset, Helper.minBalanceToDeposit, balance.lt)
      )
    )
  }, [isZeroAmountToDeposit, oChainAssetBalance, depositFees.asset])

  const renderAssetChainFeeError = useMemo(() => {
    if (!isAssetChainFeeError || isBalanceError /* Don't render anything in case of fees or balance errors */)
      return <></>

    return renderFeeError(Helper.minBalanceToDeposit(depositFees.asset), chainAssetBalance, getChainAsset(asset.chain))
  }, [isAssetChainFeeError, isBalanceError, renderFeeError, depositFees.asset, chainAssetBalance, asset])

  const txModalExtraContent = useMemo(() => {
    const stepDescriptions = [
      intl.formatMessage({ id: 'common.tx.healthCheck' }),
      intl.formatMessage({ id: 'common.tx.sendingAsset' }, { assetTicker: asset.ticker }),
      intl.formatMessage({ id: 'common.tx.sendingAsset' }, { assetTicker: AssetRuneNative.ticker }),
      intl.formatMessage({ id: 'common.tx.checkResult' })
    ]
    const stepDescription = FP.pipe(
      depositState.deposit,
      RD.fold(
        () => '',
        () =>
          `${intl.formatMessage(
            { id: 'common.step' },
            { current: depositState.step, total: depositState.stepsTotal }
          )}: ${stepDescriptions[depositState.step - 1]}`,
        () => '',
        () => `${intl.formatMessage({ id: 'common.done' })}!`
      )
    )

    return (
      <DepositAssets
        target={{ asset: AssetRuneNative, amount: runeAmountToDeposit }}
        source={O.some({ asset, amount: assetAmountToDepositMax1e8 })}
        stepDescription={stepDescription}
        network={network}
      />
    )
  }, [intl, asset, depositState, assetAmountToDepositMax1e8, runeAmountToDeposit, network])

  const onCloseTxModal = useCallback(() => {
    resetDepositState()
    changePercentHandler(0)
  }, [resetDepositState, changePercentHandler])

  const onFinishTxModal = useCallback(() => {
    onCloseTxModal()
    reloadBalances()
    reloadShares(5000)
    reloadSelectedPoolDetail(5000)
  }, [onCloseTxModal, reloadBalances, reloadSelectedPoolDetail, reloadShares])

  const renderTxModal = useMemo(() => {
    const { deposit: depositRD, depositTxs: symDepositTxs } = depositState

    // don't render TxModal in initial state
    if (RD.isInitial(depositRD)) return <></>

    // Get timer value
    const timerValue = FP.pipe(
      depositRD,
      RD.fold(
        () => 0,
        FP.flow(
          O.map(({ loaded }) => loaded),
          O.getOrElse(() => 0)
        ),
        () => 0,
        () => 100
      )
    )

    // title
    const txModalTitle = FP.pipe(
      depositRD,
      RD.fold(
        () => 'deposit.add.state.pending',
        () => 'deposit.add.state.pending',
        () => 'deposit.add.state.error',
        () => 'deposit.add.state.success'
      ),
      (id) => intl.formatMessage({ id })
    )

    const extraResult = (
      <Styled.ExtraContainer>
        {FP.pipe(symDepositTxs.asset, RD.toOption, (oTxHash) => (
          <Styled.ViewTxButtonTop
            txHash={oTxHash}
            onClick={viewAssetTx}
            label={intl.formatMessage({ id: 'common.tx.view' }, { assetTicker: asset.ticker })}
          />
        ))}
        {FP.pipe(symDepositTxs.rune, RD.toOption, (oTxHash) => (
          <ViewTxButton
            txHash={oTxHash}
            onClick={viewRuneTx}
            label={intl.formatMessage({ id: 'common.tx.view' }, { assetTicker: AssetRuneNative.ticker })}
          />
        ))}
      </Styled.ExtraContainer>
    )

    return (
      <TxModal
        title={txModalTitle}
        onClose={onCloseTxModal}
        onFinish={onFinishTxModal}
        startTime={depositStartTime}
        txRD={depositRD}
        timerValue={timerValue}
        extraResult={extraResult}
        extra={txModalExtraContent}
      />
    )
  }, [
    depositState,
    onCloseTxModal,
    onFinishTxModal,
    depositStartTime,
    txModalExtraContent,
    intl,
    viewRuneTx,
    viewAssetTx,
    asset.ticker
  ])

  const closePasswordModal = useCallback(() => {
    setShowPasswordModal(false)
  }, [setShowPasswordModal])

  const onClosePasswordModal = useCallback(() => {
    // close password modal
    closePasswordModal()
  }, [closePasswordModal])

  const onSucceedPasswordModal = useCallback(() => {
    // close private modal
    closePasswordModal()

    FP.pipe(
      oDepositParams,
      O.map((params) => {
        // set start time
        setDepositStartTime(Date.now())
        // subscribe to deposit$
        subscribeDepositState(deposit$(params))

        return true
      })
    )
  }, [closePasswordModal, oDepositParams, subscribeDepositState, deposit$])

  const fundsCapReached = useMemo(
    () =>
      FP.pipe(
        oFundsCap,
        O.map(({ reached }) => reached),
        O.getOrElse(() => false)
      ),
    [oFundsCap]
  )

  const inputOnBlur = useCallback(() => {
    setSelectedInput('none')
    reloadFeesHandler()
  }, [reloadFeesHandler])

  const uiFeesRD: UIFeesRD = useMemo(
    () =>
      FP.pipe(
        depositFeesRD,
        RD.map(({ asset: assetFee, rune }) => [
          { asset: getChainAsset(asset.chain), amount: assetFee.inFee.plus(assetFee.outFee) },
          { asset: AssetRuneNative, amount: rune.inFee.plus(rune.outFee) }
        ])
      ),
    [depositFeesRD, asset]
  )

  const needApprovement = useMemo(() => {
    // Other chains than ETH do not need an approvement
    if (!isEthChain(asset.chain)) return false
    // ETH does not need to be approved
    if (isEthAsset(asset)) return false
    // ERC20 token does need approvement only
    return isEthTokenAsset(asset)
  }, [asset])

  const uiApproveFeesRD: UIFeesRD = useMemo(
    () =>
      FP.pipe(
        approveFeeRD,
        RD.map((approveFee) => [{ asset: getChainAsset(asset.chain), amount: approveFee }])
      ),
    [approveFeeRD, asset.chain]
  )

  const isApproveFeeError = useMemo(() => {
    // ignore error check if we don't need to check allowance
    if (!needApprovement) return false

    return FP.pipe(
      oChainAssetBalance,
      O.fold(
        () => true,
        (balance) => FP.pipe(approveFee, balance.lt)
      )
    )
  }, [needApprovement, oChainAssetBalance, approveFee])

  const renderApproveFeeError = useMemo(() => {
    if (
      !isApproveFeeError ||
      // Don't render anything if chainAssetBalance is not available (still loading)
      O.isNone(oChainAssetBalance)
    )
      return <></>

    return renderFeeError(approveFee, chainAssetBalance, getChainAsset(asset.chain))
  }, [isApproveFeeError, oChainAssetBalance, renderFeeError, approveFee, chainAssetBalance, asset.chain])

  const {
    state: approveState,
    reset: resetApproveState,
    subscribe: subscribeApproveState
  } = useSubscriptionState<TxHashRD>(RD.initial)

  const onApprove = () => {
    const oRouterAddress: O.Option<Address> = FP.pipe(
      oPoolAddress,
      O.chain(({ router }) => router)
    )

    FP.pipe(
      sequenceTOption(oRouterAddress, getEthTokenAddress(asset)),
      O.map(([routerAddress, tokenAddress]) =>
        subscribeApproveState(
          approveERC20Token$({
            spender: routerAddress,
            sender: tokenAddress
          })
        )
      )
    )
  }

  const renderApproveError = useMemo(
    () =>
      FP.pipe(
        approveState,
        RD.fold(
          () => <></>,
          () => <></>,
          (error) => <Styled.ErrorLabel key="approveErrorLabel">{error.msg}</Styled.ErrorLabel>,
          () => <></>
        )
      ),
    [approveState]
  )

  // State for values of `isApprovedERC20Token$`
  const {
    state: isApprovedState,
    reset: resetIsApprovedState,
    subscribe: subscribeIsApprovedState
  } = useSubscriptionState<IsApprovedRD>(RD.success(true))

  const isApproved = useMemo(
    () =>
      !needApprovement ||
      RD.isSuccess(approveState) ||
      FP.pipe(
        isApprovedState,
        // ignore other RD states and set to `true`
        // to avoid switch between approve and submit button
        // Submit button will still be disabled
        RD.getOrElse(() => true)
      ),
    [approveState, isApprovedState, needApprovement]
  )

  const checkApprovedStatus = useCallback(
    (routerAddress: string) => {
      const oNeedApprovement: O.Option<boolean> = FP.pipe(
        needApprovement,
        // `None` if needApprovement is `false`, no request then
        O.fromPredicate((v) => !!v)
      )

      const oTokenAddress: O.Option<string> = getEthTokenAddress(asset)
      // check approve status
      FP.pipe(
        sequenceTOption(oNeedApprovement, oTokenAddress),
        O.map(([_, tokenAddress]) =>
          subscribeIsApprovedState(
            isApprovedERC20Token$({
              spender: routerAddress,
              sender: tokenAddress
            })
          )
        )
      )
    },
    [asset, isApprovedERC20Token$, needApprovement, subscribeIsApprovedState]
  )

  const prevRouterAddress = useRef<O.Option<Address>>(O.none)

  // Run `checkApprovedStatus` whenever `oPoolAddress` has been changed
  useEffect(() => {
    FP.pipe(
      oPoolAddress,
      O.chain(({ router }) => router),
      // Do nothing if prev. and current router a the same
      O.filter((router) => !eqOString.equals(O.some(router), prevRouterAddress.current)),
      // update ref
      O.map((router) => {
        prevRouterAddress.current = O.some(router)
        return router
      }),
      // check allowance status
      O.map(checkApprovedStatus)
    )
  }, [checkApprovedStatus, oPoolAddress])

  useEffect(() => {
    if (!eqOAsset.equals(prevAsset.current, O.some(asset))) {
      prevAsset.current = O.some(asset)
      // reset deposit state
      resetDepositState()
      // set values to zero
      changePercentHandler(0)
      // reset approve state
      resetApproveState()
      // reset isApproved state
      resetIsApprovedState()
      // reset fees
      prevDepositFees.current = O.none
      // reload fees
      reloadFeesHandler()
    }
  }, [
    asset,
    reloadShares,
    reloadFeesHandler,
    resetApproveState,
    resetIsApprovedState,
    reloadSelectedPoolDetail,
    resetDepositState,
    changePercentHandler,
    minRuneAmountToDeposit
  ])

  /**
   * Disables form elements (input fields, slider)
   */
  const disabledForm = useMemo(
    () =>
      haltedChain ||
      isBalanceError ||
      fundsCapReached ||
      disabled ||
      assetBalance.amount().isZero() ||
      runeBalance.amount().isZero(),
    [assetBalance, disabled, fundsCapReached, isBalanceError, runeBalance, haltedChain]
  )

  /**
   * Disables submit button
   */
  const disableSubmit = useMemo(
    () =>
      disabledForm ||
      RD.isPending(depositFeesRD) ||
      RD.isPending(approveState) ||
      isThorchainFeeError ||
      isAssetChainFeeError ||
      isZeroAmountToDeposit ||
      minRuneAmountError ||
      minAssetAmountError,
    [
      approveState,
      depositFeesRD,
      disabledForm,
      isAssetChainFeeError,
      isThorchainFeeError,
      isZeroAmountToDeposit,
      minAssetAmountError,
      minRuneAmountError
    ]
  )

  return (
    <Styled.Container>
      {showBalanceError && (
        <Styled.BalanceErrorRow>
          <Col xs={24}>{showBalanceError && renderBalanceError}</Col>
        </Styled.BalanceErrorRow>
      )}
      <Styled.CardsRow gutter={{ lg: 32 }}>
        <Col xs={24} xl={12}>
          <Styled.AssetCard
            assetBalance={oAssetBalance}
            disabled={disabledForm}
            asset={asset}
            selectedAmount={assetAmountToDepositMax1e8}
            maxAmount={maxAssetAmountToDepositMax1e8}
            onChangeAssetAmount={assetAmountChangeHandler}
            inputOnFocusHandler={() => setSelectedInput('asset')}
            inputOnBlurHandler={inputOnBlur}
            price={assetPrice}
            balances={balances}
            percentValue={percentValueToDeposit}
            onChangePercent={changePercentHandler}
            onChangeAsset={onChangeAssetHandler}
            priceAsset={priceAsset}
            network={network}
            onAfterSliderChange={onAfterSliderChangeHandler}
            minAmountError={minAssetAmountError}
            minAmountLabel={`${intl.formatMessage({ id: 'common.min' })}: ${formatAssetAmountCurrency({
              asset,
              amount: baseToAsset(minAssetAmountToDepositMax1e8),
              trimZeros: true
            })}`}
          />
        </Col>

        <Col xs={24} xl={12}>
          <>
            <Styled.AssetCard
              assetBalance={oRuneBalance}
              disabled={disabledForm}
              asset={AssetRuneNative}
              selectedAmount={runeAmountToDeposit}
              maxAmount={maxRuneAmountToDeposit}
              onChangeAssetAmount={runeAmountChangeHandler}
              inputOnFocusHandler={() => setSelectedInput('rune')}
              inputOnBlurHandler={inputOnBlur}
              price={runePrice}
              priceAsset={priceAsset}
              network={network}
              balances={[]}
              minAmountError={minRuneAmountError}
              minAmountLabel={`${intl.formatMessage({ id: 'common.min' })}: ${formatAssetAmountCurrency({
                asset: AssetRuneNative,
                amount: baseToAsset(minRuneAmountToDeposit),
                trimZeros: true
              })}`}
            />
          </>
        </Col>
      </Styled.CardsRow>

      {isApproved ? (
        <>
          <Styled.FeesRow gutter={{ lg: 32 }}>
            <Col xs={24} xl={12}>
              <Styled.FeeRow>
                <Fees fees={uiFeesRD} reloadFees={reloadFeesHandler} />
              </Styled.FeeRow>
              <Styled.FeeErrorRow>
                <Col>
                  <>
                    {renderAssetChainFeeError}
                    {renderThorchainFeeError}
                  </>
                </Col>
              </Styled.FeeErrorRow>
            </Col>
          </Styled.FeesRow>

          <Styled.SubmitButtonWrapper>
            <Styled.SubmitButton sizevalue="xnormal" onClick={confirmDepositHandler} disabled={disableSubmit}>
              {intl.formatMessage({ id: 'common.add' })}
            </Styled.SubmitButton>
          </Styled.SubmitButtonWrapper>
        </>
      ) : (
        <Styled.SubmitContainer>
          <Styled.SubmitButton
            sizevalue="xnormal"
            onClick={onApprove}
            loading={RD.isPending(approveState)}
            color="warning"
            disabled={isApproveFeeError}>
            {intl.formatMessage({ id: 'common.approve' })}
          </Styled.SubmitButton>
          {!RD.isInitial(uiApproveFeesRD) && <Fees fees={uiApproveFeesRD} reloadFees={reloadApproveFeesHandler} />}
          {renderApproveFeeError}
          {renderApproveError}
        </Styled.SubmitContainer>
      )}
      {showPasswordModal && (
        <PasswordModal
          onSuccess={onSucceedPasswordModal}
          onClose={onClosePasswordModal}
          validatePassword$={validatePassword$}
        />
      )}
      {renderTxModal}
    </Styled.Container>
  )
}
