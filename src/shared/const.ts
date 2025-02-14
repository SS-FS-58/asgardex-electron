import * as A from 'fp-ts/lib/Array'

import { envOrDefault } from '../renderer/helpers/envHelper'
import { StoreFilesContent, UserNodesStorage } from './api/types'
import { Locale } from './i18n/types'

export const IS_PRODUCTION = envOrDefault(process.env.NODE_ENV, '') === 'production'

export enum ExternalUrl {
  WEBSITE = 'https://thorchain.org',
  DOCS = 'https://docs.thorchain.org/',
  TELEGRAM = 'https://t.me/thorchain_org',
  GITHUB = 'https://github.com/thorchain',
  GITHUB_REPO = `https://github.com/thorchain/asgardex-electron`,
  GITHUB_RELEASE = `https://github.com/thorchain/asgardex-electron/releases/tag/v`,
  TWITTER = 'https://twitter.com/thorchain_org'
}

// increase it by `1` if you want to ignore previous version of `UserNodesStorage`
const USER_NODES_STORAGE_VERSION = '1'

export const USER_NODES_STORAGE_DEFAULT: UserNodesStorage = {
  version: USER_NODES_STORAGE_VERSION,
  mainnet: A.empty,
  chaosnet: A.empty,
  testnet: A.empty
}

// increase it by `1` if you want to ignore previous version of `common` storage
const COMMON_STORAGE_VERSION = '1'
/**
 * When adding a new store file do not forget to expose
 * public api for it at src/main/preload.ts
 */
export const DEFAULT_STORAGES: StoreFilesContent = {
  common: { version: COMMON_STORAGE_VERSION, locale: Locale.EN },
  userNodes: USER_NODES_STORAGE_DEFAULT
}
