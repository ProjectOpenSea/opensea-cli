import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import {
  addSendOptions,
  runMarketplaceSteps,
  type SendOptions,
} from "../marketplace/cli.js"
import { planActionSteps } from "../marketplace/guard.js"
import type { OutputFormat } from "../output.js"
import { formatOutput, outputGet } from "../output.js"
import { pathSegment, readJsonBodyOption } from "../parse.js"
import type {
  CancelRequest,
  CreateCancelOrderActionsRequest,
  CreateCancelOrderActionsResponse,
} from "../types/index.js"
import { resolveChainId } from "../wallet/index.js"

export function ordersCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("orders").description("Manage OpenSea orders")

  cmd
    .command("get")
    .description("Get a single order by hash")
    .argument("<chain>", "Chain the order lives on (e.g. ethereum, base)")
    .argument("<protocol_address>", "Seaport protocol contract address")
    .argument("<order_hash>", "Order hash")
    .action(
      async (chain: string, protocolAddress: string, orderHash: string) => {
        const client = getClient()
        await outputGet(
          client,
          getFormat(),
          `/api/v2/orders/chain/${pathSegment(chain)}/protocol/${pathSegment(protocolAddress)}/${pathSegment(orderHash)}`,
        )
      },
    )

  cmd
    .command("cancel")
    .description(
      "Cancel an order offchain as the authenticated wallet (wallet auth required)",
    )
    .argument("<chain>", "Chain the order lives on (e.g. ethereum, base)")
    .argument("<protocol_address>", "Seaport protocol contract address")
    .argument("<order_hash>", "Order hash to cancel")
    .option(
      "--body <path>",
      "Path to JSON file with an optional CancelRequest body (e.g. offererSignature)",
    )
    .action(
      async (
        chain: string,
        protocolAddress: string,
        orderHash: string,
        options: { body?: string },
      ) => {
        const client = getClient()
        const body = options.body
          ? readJsonBodyOption<CancelRequest>(options.body, "--body")
          : undefined
        const result = await client.post(
          `/api/v2/orders/chain/${pathSegment(chain)}/protocol/${pathSegment(protocolAddress)}/${pathSegment(orderHash)}/cancel`,
          body,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  addSendOptions(
    cmd
      .command("cancel-actions")
      .description(
        "Get ordered actions needed to cancel an order onchain; with --send, cancel it with the configured EVM wallet",
      )
      .argument("<chain>", "Chain the order lives on (e.g. ethereum, solana)")
      .argument("<protocol_address>", "Order protocol address")
      .argument("<order_identifier>", "Order hash or SVM order identifier")
      .requiredOption(
        "--body <path>",
        "Path to JSON file with the CancelOrderActionsRequest body",
      ),
  ).action(
    async (
      chain: string,
      protocolAddress: string,
      orderIdentifier: string,
      options: SendOptions & { body: string },
    ) => {
      const client = getClient()
      const body = readJsonBodyOption<CreateCancelOrderActionsRequest>(
        options.body,
        "--body",
      )
      await runMarketplaceSteps({
        client,
        format: getFormat(),
        options,
        account: body.address,
        purpose: "order cancellation",
        request: () =>
          client.post<CreateCancelOrderActionsResponse>(
            `/api/v2/orders/chain/${pathSegment(chain)}/protocol/${pathSegment(protocolAddress)}/${pathSegment(orderIdentifier)}/cancel/actions`,
            body,
          ),
        plan: response => ({
          steps: planActionSteps(response.steps, body.address, {
            chainId: resolveChainId(chain),
            cancelledOrders: [orderIdentifier],
          }),
        }),
      })
    },
  )

  return cmd
}
