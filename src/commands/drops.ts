import { randomUUID } from "node:crypto"
import { constants, lstatSync, readdirSync, readFileSync } from "node:fs"
import { open } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { uploadToContext } from "@opensea/sdk"
import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import {
  addPaginationOptions,
  parseIntOption,
  pathSegment,
  readJsonBodyOption,
  requireChainOption,
} from "../parse.js"
import { DropsAPI } from "../sdk.js"
import type {
  Chain,
  CrossChainDropMintRequest,
  CrossChainDropMintResponse,
  DropDeployRequest,
  DropDeployResponse,
  DropEligibilityResponse,
  DropMintResponse,
  DropTransactionResponse,
  SaveDropEditsRequest,
  SaveDropItemMediaBatchRequest,
  SavePrerevealDropItemRequest,
  SaveSelfMintDropItemRequest,
  UpdateDropItemRequest,
  UpdateSelfMintDropItemRequest,
  UploadDropItemMediaRequest,
  ValidateDropAllowlistRequest,
} from "../types/index.js"
import { selectUploadContext } from "../upload.js"
import type { EvmWalletAdapter, WalletProvider } from "../wallet/index.js"
import {
  createWalletForProvider,
  createWalletFromEnv,
  isEvmAdapter,
  WALLET_PROVIDERS,
  WrongChainTypeError,
} from "../wallet/index.js"

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

async function readUploadContextJson(source: string): Promise<unknown> {
  if (source !== "-") return readJsonBodyOption(source, "--context")
  const raw = await readStdin()
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `Could not parse --context from stdin as JSON: ${(err as Error).message}`,
    )
  }
}

export async function openEvmWallet(
  walletProvider: string | undefined,
  action: string,
): Promise<{ wallet: EvmWalletAdapter; address: string }> {
  const wallet = walletProvider
    ? createWalletForProvider(walletProvider as WalletProvider)
    : createWalletFromEnv()
  if (!isEvmAdapter(wallet)) {
    console.error(
      `Error: ${new WrongChainTypeError(wallet, "evm", action).message}`,
    )
    process.exit(1)
  }
  const address = await wallet.getAddress()
  console.error(`Using ${wallet.name} wallet: ${address}`)
  return { wallet, address }
}

/** Quote an argument for a copy-pasteable POSIX shell command, if it needs it. */
function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, "'\\''")}'`
}

const filenameCollator = new Intl.Collator("en", { numeric: true })

/**
 * The item media files in `dir`, in natural filename order (2.png before
 * 10.png), which is the item order a save without a manifest uses. Hidden
 * files such as .DS_Store, subdirectories, and .csv files are skipped: the API
 * never takes a CSV as item media, so a manifest can sit in the same folder.
 *
 * A symlink is refused rather than followed. Drop media goes to a public CDN,
 * so a link named 1.png in a downloaded folder must not be able to publish a
 * file from elsewhere on the machine.
 */
interface ListedMediaFile {
  filename: string
  path: string
  /** Identity of the file when it was listed, checked again when it is read. */
  dev: bigint
  ino: bigint
}

function listItemMediaFiles(dir: string): ListedMediaFile[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch (err) {
    throw new Error(
      `Could not read directory '${dir}': ${(err as Error).message}`,
    )
  }
  const symlinks: string[] = []
  const files: ListedMediaFile[] = []
  for (const name of names) {
    if (name.startsWith(".") || extname(name).toLowerCase() === ".csv") continue
    const path = join(dir, name)
    const stats = lstatSync(path, { bigint: true, throwIfNoEntry: false })
    if (stats?.isSymbolicLink()) symlinks.push(name)
    if (stats?.isFile()) {
      files.push({ filename: name, path, dev: stats.dev, ino: stats.ino })
    }
  }
  files.sort(
    (a, b) =>
      filenameCollator.compare(a.filename, b.filename) ||
      (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0),
  )
  if (symlinks.length > 0) {
    throw new Error(
      `Refusing to upload symlinks in '${dir}': ${symlinks.join(", ")}. Copy the files into the folder instead.`,
    )
  }
  if (files.length === 0) {
    throw new Error(`No item media files in '${dir}'`)
  }
  return files
}

/**
 * Read a file listed by `listItemMediaFiles`, refusing anything but the file
 * that was listed. The listing already refuses symlinks, but the file is read
 * later, so an entry swapped for a link in between would otherwise be
 * followed. O_NOFOLLOW makes the open fail on a link where the platform has
 * it. On every platform, including Windows where it does not exist, the opened
 * handle must be a regular file with the device and inode the listing
 * recorded, and the bytes are read from that same handle.
 */
async function readListedFile(file: ListedMediaFile): Promise<Buffer> {
  const handle = await open(
    file.path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  )
  try {
    const stats = await handle.stat({ bigint: true })
    if (!stats.isFile() || stats.dev !== file.dev || stats.ino !== file.ino) {
      throw new Error(`${file.path} changed after it was listed`)
    }
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}

const DROP_TYPES = [
  "seadrop_v1_erc721",
  "seadrop_v2_erc1155_self_mint",
] as const satisfies readonly DropDeployRequest["drop_type"][]
const TOKEN_TYPES = [
  "erc721_clone",
  "erc721_standard",
  "erc1155_clone",
] as const satisfies readonly DropDeployRequest["token_type"][]

function parseChoice<T extends string>(
  value: string,
  flag: string,
  choices: readonly T[],
): T {
  if (!choices.includes(value as T)) {
    throw new Error(
      `Invalid value for ${flag}: "${value}". Expected one of: ${choices.join(", ")}.`,
    )
  }
  return value as T
}

// Validated before any request, so a bad flag never starts a workflow or a
// poll.
function parseWaitOptions(options: { interval: string; waitTimeout: string }): {
  intervalMs: number
  timeoutMs: number
} {
  const intervalMs = parseIntOption(options.interval, "--interval") * 1_000
  const timeoutMs =
    parseIntOption(options.waitTimeout, "--wait-timeout") * 1_000
  if (intervalMs < 1_000) {
    throw new Error("--interval must be at least 1 second")
  }
  if (timeoutMs < 0) {
    throw new Error("--wait-timeout must not be negative")
  }
  return { intervalMs, timeoutMs }
}

function addWaitOptions(cmd: Command, waitDescription: string): Command {
  return cmd
    .option("--wait", waitDescription)
    .option("--interval <seconds>", "Seconds between polls with --wait", "5")
    .option(
      "--wait-timeout <seconds>",
      "Seconds to wait before giving up with --wait",
      "600",
    )
}

function addDropTransactionCommand(
  cmd: Command,
  name: "publish" | "unpublish",
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): void {
  const build = (drops: DropsAPI, slug: string) =>
    name === "publish"
      ? drops.buildPublishTransaction(slug)
      : drops.buildUnpublishTransaction(slug)

  cmd
    .command(name)
    .description(
      `Build the ${name} transaction for a drop; with --send, sign and send it from the contract owner's wallet`,
    )
    .argument("<slug>", "Collection slug")
    .option(
      "--send",
      "Sign and send the transaction with the configured EVM wallet",
    )
    .option(
      "--wallet-provider <provider>",
      `Wallet provider to use with --send (${WALLET_PROVIDERS.join(", ")})`,
    )
    .action(
      async (
        slug: string,
        options: { send?: boolean; walletProvider?: string },
      ) => {
        const drops = new DropsAPI(getClient())
        const format = getFormat()
        if (!options.send) {
          const tx: DropTransactionResponse = await build(drops, slug)
          console.log(formatOutput(tx, format))
          return
        }

        const { wallet } = await openEvmWallet(
          options.walletProvider,
          `drop ${name}`,
        )
        const tx = await build(drops, slug)
        const result = await drops.sendTransaction(tx, wallet, {
          onSending: sending =>
            console.error(
              `Sending ${name} transaction to ${sending.to} on chain ${sending.chain} (${sending.chainId})...`,
            ),
        })
        console.log(formatOutput({ hash: result.hash }, format))
      },
    )
}

export function dropsCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("drops").description("Query and mint NFT drops")

  addPaginationOptions(
    cmd
      .command("list")
      .description("List drops (featured, upcoming, or recently minted)")
      .option(
        "--type <type>",
        "Drop type: featured, upcoming, or recently_minted",
        "featured",
      )
      .option(
        "--chains <chains>",
        "Comma-separated list of chains to filter by",
      ),
    "Number of results (max 100)",
  ).action(
    async (options: {
      type: string
      chains?: string
      limit: string
      next?: string
    }) => {
      const client = getClient()
      await outputGet(client, getFormat(), "/api/v2/drops", {
        type: options.type,
        chains: options.chains,
        limit: parseIntOption(options.limit, "--limit"),
        cursor: options.next,
      })
    },
  )

  addPaginationOptions(
    cmd
      .command("items")
      .description(
        "List a drop's saved items, including a draft's (write:drops, collection editor)",
      )
      .argument("<slug>", "Collection slug"),
  ).action(async (slug: string, options: { limit: string; next?: string }) => {
    const drops = new DropsAPI(getClient())
    const result = await drops.items(slug, {
      limit: parseIntOption(options.limit, "--limit"),
      next: options.next,
    })
    console.log(formatOutput(result, getFormat()))
  })

  cmd
    .command("get")
    .description("Get detailed drop info by collection slug")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      await outputGet(client, getFormat(), `/api/v2/drops/${pathSegment(slug)}`)
    })

  cmd
    .command("eligibility")
    .description("Check drop eligibility for the authenticated wallet")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      const result = await client.get<DropEligibilityResponse>(
        `/api/v2/drops/${pathSegment(slug)}/eligibility`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("mint")
    .description(
      "Build a mint transaction for a drop; with --send, sign and send it from the configured wallet",
    )
    .argument("<slug>", "Collection slug")
    .requiredOption("--minter <address>", "Wallet address to receive tokens")
    .option("--quantity <n>", "Number of tokens to mint", "1")
    .option(
      "--send",
      "Sign and send the transaction with the configured EVM wallet, which pays; --minter receives the tokens",
    )
    .option(
      "--wallet-provider <provider>",
      `Wallet provider to use with --send (${WALLET_PROVIDERS.join(", ")})`,
    )
    .action(
      async (
        slug: string,
        options: {
          minter: string
          quantity: string
          send?: boolean
          walletProvider?: string
        },
      ) => {
        const quantity = parseIntOption(options.quantity, "--quantity")
        const drops = new DropsAPI(getClient())
        const format = getFormat()
        if (!options.send) {
          const tx: DropMintResponse = await drops.mint(slug, {
            minter: options.minter,
            quantity,
          })
          console.log(formatOutput(tx, format))
          return
        }

        const { wallet, address } = await openEvmWallet(
          options.walletProvider,
          "drop mint",
        )
        console.error(
          `Minting ${quantity} from ${address} to minter ${options.minter}`,
        )
        const tx = await drops.mint(slug, { minter: options.minter, quantity })
        const result = await drops.sendMintTransaction(tx, wallet, {
          onSending: sending =>
            console.error(
              `Sending mint transaction to ${sending.to} on chain ${sending.chain} (${sending.chainId})...`,
            ),
        })
        console.log(
          formatOutput(
            {
              hash: result.hash,
              chain: tx.chain,
              from: address,
              minter: options.minter,
            },
            format,
          ),
        )
      },
    )

  cmd
    .command("cross-chain-mint")
    .description("Build transactions to pay on one chain and mint on another")
    .argument("<slug>", "Collection slug")
    .requiredOption("--payer <address>", "Wallet that signs and pays")
    .requiredOption("--minter <address>", "Wallet that receives the NFT")
    .requiredOption("--payment-chain <chain>", "Chain used for payment")
    .requiredOption(
      "--payment-token <address>",
      "Payment token contract or the null address for native currency",
    )
    .option("--quantity <n>", "Number of tokens to mint", "1")
    .action(
      async (
        slug: string,
        options: {
          payer: string
          minter: string
          paymentChain: string
          paymentToken: string
          quantity: string
        },
      ) => {
        const client = getClient()
        const request: CrossChainDropMintRequest = {
          payer: options.payer,
          minter: options.minter,
          quantity: parseIntOption(options.quantity, "--quantity"),
          payment: {
            chain: options.paymentChain,
            token_address: options.paymentToken,
          },
        }
        const result = await client.post<CrossChainDropMintResponse>(
          `/api/v2/drops/${pathSegment(slug)}/cross_chain_mint`,
          request,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("deploy")
    .description(
      "Build a deploy-contract transaction for a new drop; with --send, sign and send it from the --sender wallet",
    )
    // Required, but checked in the action: see requireChainOption.
    .option("--chain <chain>", "Chain slug, e.g. ethereum or base (required)")
    .requiredOption("--name <name>", "Contract name")
    .requiredOption("--symbol <symbol>", "Contract symbol")
    .requiredOption("--drop-type <type>", "Drop type (e.g. seadrop_v1_erc721)")
    .requiredOption("--token-type <type>", "Token type (e.g. erc721_standard)")
    .requiredOption("--sender <address>", "Deployer wallet address")
    .option(
      "--send",
      "Sign and send the transaction with the configured EVM wallet, which must be --sender",
    )
    .option(
      "--wallet-provider <provider>",
      `Wallet provider to use with --send (${WALLET_PROVIDERS.join(", ")})`,
    )
    .action(
      async (
        options: {
          chain?: string
          name: string
          symbol: string
          dropType: string
          tokenType: string
          sender: string
          send?: boolean
          walletProvider?: string
        },
        command: Command,
      ) => {
        const chain = requireChainOption(options.chain, command)
        const drops = new DropsAPI(getClient())
        const format = getFormat()
        const request: DropDeployRequest = {
          chain,
          contract_name: options.name,
          contract_symbol: options.symbol,
          drop_type: parseChoice(options.dropType, "--drop-type", DROP_TYPES),
          token_type: parseChoice(
            options.tokenType,
            "--token-type",
            TOKEN_TYPES,
          ),
          sender: options.sender,
        }
        if (!options.send) {
          const tx: DropDeployResponse = await drops.deploy(request)
          console.log(formatOutput(tx, format))
          return
        }

        const { wallet } = await openEvmWallet(
          options.walletProvider,
          "drop deploy",
        )
        const tx = await drops.deploy(request)
        const result = await drops.sendDeployTransaction(
          tx,
          options.sender,
          wallet,
          {
            onSending: sending =>
              console.error(
                `Sending deploy transaction to ${sending.to} on chain ${sending.chain} (${sending.chainId})...`,
              ),
          },
        )
        console.log(
          formatOutput({ hash: result.hash, chain: tx.chain }, format),
        )
        console.error(
          `Next: opensea drops deploy-receipt ${tx.chain} ${result.hash} --wait`,
        )
      },
    )

  addWaitOptions(
    cmd
      .command("deploy-receipt")
      .description(
        "Get the receipt for a previously submitted deploy transaction; with --wait, poll until it has a collection slug or fails",
      )
      .argument("<chain>", "Chain slug")
      .argument("<tx-hash>", "Transaction hash"),
    "Poll until the receipt reports a collection slug or a failed status",
  ).action(
    async (
      chain: string,
      txHash: string,
      options: { wait?: boolean; interval: string; waitTimeout: string },
    ) => {
      const { intervalMs, timeoutMs } = parseWaitOptions(options)
      const client = getClient()
      const format = getFormat()
      if (!options.wait) {
        await outputGet(
          client,
          format,
          `/api/v2/drops/deploy/${pathSegment(chain)}/${pathSegment(txHash)}/receipt`,
        )
        return
      }

      console.error(
        `Waiting for deploy ${txHash}. Polling every ${intervalMs / 1_000}s...`,
      )
      const receipt = await new DropsAPI(client).waitForDeployReceipt(
        chain as Chain,
        txHash,
        {
          intervalMs,
          timeoutMs,
          onProgress: progress =>
            console.error(
              `Status: ${progress.status}${progress.contract_address ? ` (contract ${progress.contract_address})` : ""}`,
            ),
        },
      )
      console.log(formatOutput(receipt, format))
      if (receipt.status === "failed") {
        console.error(`Error: deploy ${txHash} failed`)
        process.exit(1)
      }
    },
  )

  cmd
    .command("save-edits")
    .description("Save edits to a drop's stages and settings (Creator Studio)")
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the SaveDropEditsRequest body",
    )
    .action(async (slug: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<SaveDropEditsRequest>(
        options.body,
        "--body",
      )
      const result = await client.post(
        `/api/v2/drops/${pathSegment(slug)}`,
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("create-allowlist-upload")
    .description("Request a presigned upload for a drop allowlist file")
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const client = getClient()
      const result = await client.post(
        `/api/v2/drops/${pathSegment(slug)}/allowlist`,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("validate-allowlist")
    .description("Validate a previously uploaded drop allowlist file")
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the ValidateDropAllowlistRequest body",
    )
    .action(async (slug: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<ValidateDropAllowlistRequest>(
        options.body,
        "--body",
      )
      const result = await client.post(
        `/api/v2/drops/${pathSegment(slug)}/allowlist/validate`,
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("save-prereveal-item")
    .description("Save the prereveal item for a drop")
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the SavePrerevealDropItemRequest body",
    )
    .action(async (slug: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<SavePrerevealDropItemRequest>(
        options.body,
        "--body",
      )
      const result = await client.post(
        `/api/v2/drops/${pathSegment(slug)}/prereveal-item`,
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("save-item")
    .description("Save a self-mint drop item")
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the SaveSelfMintDropItemRequest body",
    )
    .action(async (slug: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<SaveSelfMintDropItemRequest>(
        options.body,
        "--body",
      )
      const result = await client.post(
        `/api/v2/drops/${pathSegment(slug)}/items`,
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("update-self-mint-item")
    .description("Replace a self-mint drop item by token id")
    .argument("<slug>", "Collection slug")
    .argument("<token_id>", "Token id of the item to update")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the UpdateSelfMintDropItemRequest body",
    )
    .action(
      async (slug: string, tokenId: string, options: { body: string }) => {
        const client = getClient()
        const request = readJsonBodyOption<UpdateSelfMintDropItemRequest>(
          options.body,
          "--body",
        )
        const result = await client.put(
          `/api/v2/drops/${pathSegment(slug)}/items/${pathSegment(tokenId)}`,
          request,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("update-item")
    .description("Update fields of a drop item by token id")
    .argument("<slug>", "Collection slug")
    .argument("<token_id>", "Token id of the item to update")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the UpdateDropItemRequest body",
    )
    .action(
      async (slug: string, tokenId: string, options: { body: string }) => {
        const client = getClient()
        const request = readJsonBodyOption<UpdateDropItemRequest>(
          options.body,
          "--body",
        )
        const result = await client.patch(
          `/api/v2/drops/${pathSegment(slug)}/items/${pathSegment(tokenId)}`,
          request,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("upload-items")
    .description(
      "Upload every item media file in a folder and save them as the drop's items, in one upload batch. " +
        "Replaces the drop's items.",
    )
    .argument("<slug>", "Collection slug")
    .argument(
      "<dir>",
      "Folder of item media files. Without a manifest, items are numbered 1 to n in natural filename order (2.png before 10.png). Hidden files, subfolders and .csv files are skipped.",
    )
    .option(
      "--manifest <path>",
      "Metadata manifest CSV to upload first, so the save takes token ids and metadata from it",
    )
    .option("--concurrency <n>", "Storage uploads to run at once", "4")
    .action(
      async (
        slug: string,
        dir: string,
        options: { manifest?: string; concurrency: string },
      ) => {
        const concurrency = parseIntOption(options.concurrency, "--concurrency")
        if (concurrency < 1) {
          throw new Error("--concurrency must be at least 1")
        }
        const files = listItemMediaFiles(dir)
        let manifestBytes: Buffer | undefined
        if (options.manifest) {
          try {
            manifestBytes = readFileSync(options.manifest)
          } catch (err) {
            throw new Error(
              `Could not read --manifest '${options.manifest}': ${(err as Error).message}`,
            )
          }
        }

        const uploadBatchId = randomUUID()
        console.error(
          `Uploading ${files.length} files in upload batch ${uploadBatchId}`,
        )
        const drops = new DropsAPI(getClient())
        let uploaded = 0
        let reported = 0
        try {
          const result = await drops.uploadItemMedia(
            slug,
            files.map(file => ({
              filename: file.filename,
              data: async () =>
                new Blob([new Uint8Array(await readListedFile(file))]),
            })),
            {
              uploadBatchId,
              concurrency,
              manifest:
                options.manifest && manifestBytes
                  ? {
                      filename: basename(options.manifest),
                      data: new Blob([new Uint8Array(manifestBytes)]),
                    }
                  : undefined,
              onProgress: progress => {
                uploaded = progress.uploaded
                if (
                  progress.uploaded === progress.total ||
                  progress.uploaded - reported >= 50
                ) {
                  reported = progress.uploaded
                  console.error(
                    `Uploaded ${progress.uploaded}/${progress.total}`,
                  )
                }
              },
            },
          )
          console.log(formatOutput(result, getFormat()))
        } catch (err) {
          if (uploaded === files.length) {
            console.error(
              `Every file is uploaded in batch ${uploadBatchId}, but the save failed. ` +
                `After fixing the cause, save without uploading again: ` +
                `opensea drops save-item-media-batch ${shellQuote(slug)} --upload-batch-id ${uploadBatchId} --dir ${shellQuote(dir)}`,
            )
          }
          throw err
        }
      },
    )

  cmd
    .command("create-item-media-upload")
    .description(
      "Request presigned uploads for up to 50 drop item media files. " +
        "For a bulk save, pass the same --upload-batch-id on every request, then run save-item-media-batch (upload-items does all of this).",
    )
    .argument("<slug>", "Collection slug")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the UploadDropItemMediaRequest body",
    )
    .option(
      "--upload-batch-id <uuid>",
      "Upload batch to add these files to; sets upload_batch_id in the body",
    )
    .action(
      async (
        slug: string,
        options: { body: string; uploadBatchId?: string },
      ) => {
        const client = getClient()
        const body = readJsonBodyOption<UploadDropItemMediaRequest>(
          options.body,
          "--body",
        )
        const request: UploadDropItemMediaRequest =
          options.uploadBatchId === undefined
            ? body
            : { ...body, upload_batch_id: options.uploadBatchId }
        const result = await client.post(
          `/api/v2/drops/${pathSegment(slug)}/items/media`,
          request,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("save-item-media-batch")
    .description(
      "Save a drop's items from files uploaded in one upload batch, by filename. Replaces the drop's items. " +
        "Pass --body, or --upload-batch-id with --dir to save a folder's files in upload-items order.",
    )
    .argument("<slug>", "Collection slug")
    .option(
      "--body <path>",
      "Path to JSON file with the SaveDropItemMediaBatchRequest body",
    )
    .option(
      "--upload-batch-id <uuid>",
      "The upload_batch_id the files were uploaded with",
    )
    .option(
      "--dir <path>",
      "Folder whose files to save, listed as upload-items lists them (needs --upload-batch-id)",
    )
    .action(
      async (
        slug: string,
        options: { body?: string; uploadBatchId?: string; dir?: string },
      ) => {
        let request: SaveDropItemMediaBatchRequest
        if (options.body !== undefined) {
          if (options.dir !== undefined) {
            throw new Error("Pass either --body or --dir, not both")
          }
          const body = readJsonBodyOption<SaveDropItemMediaBatchRequest>(
            options.body,
            "--body",
          )
          request =
            options.uploadBatchId === undefined
              ? body
              : { ...body, upload_batch_id: options.uploadBatchId }
        } else if (options.dir !== undefined) {
          if (options.uploadBatchId === undefined) {
            throw new Error("--dir needs --upload-batch-id")
          }
          request = {
            upload_batch_id: options.uploadBatchId,
            filenames: listItemMediaFiles(options.dir).map(
              file => file.filename,
            ),
          }
        } else {
          throw new Error("Pass --body, or --upload-batch-id with --dir")
        }
        const drops = new DropsAPI(getClient())
        const result = await drops.saveItemMediaBatch(slug, request)
        console.log(formatOutput(result, getFormat()))
      },
    )

  addDropTransactionCommand(cmd, "publish", getClient, getFormat)
  addDropTransactionCommand(cmd, "unpublish", getClient, getFormat)

  addWaitOptions(
    cmd
      .command("upload-metadata-ipfs")
      .description(
        "Start uploading a drop's item media and metadata to IPFS; with --wait, poll until it finishes",
      )
      .argument("<slug>", "Collection slug"),
    "Poll progress until the upload is no longer running",
  ).action(
    async (
      slug: string,
      options: { wait?: boolean; interval: string; waitTimeout: string },
    ) => {
      const drops = new DropsAPI(getClient())
      const format = getFormat()
      const { intervalMs, timeoutMs } = parseWaitOptions(options)

      const started = await drops.uploadMetadataToIpfs(slug)
      if (!options.wait) {
        console.log(formatOutput(started, format))
        return
      }

      console.error(
        `IPFS upload started: ${started.workflow_execution_id}. Polling every ${intervalMs / 1_000}s...`,
      )
      const final = await drops.waitForMetadataIpfs(
        slug,
        started.workflow_execution_id,
        {
          intervalMs,
          timeoutMs,
          onProgress: progress =>
            console.error(
              `Status: ${progress.status} (media ${progress.media_upload_progress ?? 0}%, metadata ${progress.metadata_upload_progress ?? 0}%)`,
            ),
        },
      )
      const output = {
        workflow_execution_id: started.workflow_execution_id,
        ...final,
      }
      console.log(formatOutput(output, format))
      if (final.status !== "completed") {
        console.error(
          final.status === "failed"
            ? `Error: IPFS upload failed${final.failure_reason ? `: ${final.failure_reason}` : ""}`
            : `Error: IPFS upload ${started.workflow_execution_id} was not found`,
        )
        process.exit(1)
      }
    },
  )

  cmd
    .command("metadata-ipfs-status")
    .description("Get the progress of a drop's IPFS metadata upload")
    .argument("<slug>", "Collection slug")
    .argument(
      "<workflow-execution-id>",
      "The workflow_execution_id returned by upload-metadata-ipfs",
    )
    .action(async (slug: string, workflowExecutionId: string) => {
      const drops = new DropsAPI(getClient())
      const result = await drops.getMetadataIpfsProgress(
        slug,
        workflowExecutionId,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("create-manifest-upload")
    .description(
      "Request an upload context for a drop's metadata manifest CSV (upload it with upload-file)",
    )
    .argument("<slug>", "Collection slug")
    .action(async (slug: string) => {
      const drops = new DropsAPI(getClient())
      const result = await drops.createManifestUpload(slug)
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("upload-file")
    .description(
      "Upload a file to the storage URL an upload context describes, and print its token. " +
        "For the array create-item-media-upload returns, pass --index or pipe one element.",
    )
    .requiredOption(
      "--context <path>",
      "Path to the upload context JSON, or - to read it from stdin",
    )
    .requiredOption("--file <path>", "Path to the file to upload")
    .option(
      "--index <n>",
      "Element to use when the context JSON is an array of upload contexts",
    )
    .action(
      async (options: { context: string; file: string; index?: string }) => {
        const context = selectUploadContext(
          await readUploadContextJson(options.context),
          options.index === undefined
            ? undefined
            : parseIntOption(options.index, "--index"),
        )
        let bytes: Buffer
        try {
          bytes = readFileSync(options.file)
        } catch (err) {
          throw new Error(
            `Could not read --file '${options.file}': ${(err as Error).message}`,
          )
        }
        const result = await uploadToContext(context, bytes, {
          filename: basename(options.file),
        })
        console.log(formatOutput(result, getFormat()))
      },
    )

  return cmd
}
