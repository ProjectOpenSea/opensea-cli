import { Command } from "commander"
import type { OpenSeaClient } from "../client.js"
import type { OutputFormat } from "../output.js"
import { formatOutput } from "../output.js"
import { readJsonBodyOption } from "../parse.js"
import type {
  ClaimAccountUsernameRequest,
  ClaimAccountUsernameResponse,
  ClearNftPfpResponse,
  CreateProfileShelfRequest,
  NftPfpResponse,
  ProfileShelfActionResponse,
  ProfileShelfResponse,
  ReorderProfileShelvesRequest,
  SetNftPfpRequest,
  UpdateProfileSettingsRequest,
  UpdateProfileSettingsResponse,
  UpdateProfileShelfRequest,
  UploadContext,
  UploadProfileImageRequest,
} from "../types/index.js"

export function profileCommand(
  getClient: () => OpenSeaClient,
  getFormat: () => OutputFormat,
): Command {
  const cmd = new Command("profile").description(
    "Manage the authenticated wallet's profile (wallet auth required)",
  )

  cmd
    .command("settings")
    .description("Update profile settings (display name, bio, images, etc.)")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the UpdateProfileSettingsRequest body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<UpdateProfileSettingsRequest>(
        options.body,
        "--body",
      )
      const result = await client.patch<UpdateProfileSettingsResponse>(
        "/api/v2/profile",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("claim-username")
    .description("Claim an OpenSea username for the authenticated wallet")
    .argument("<username>", "Username to claim")
    .action(async (username: string) => {
      const client = getClient()
      const body: ClaimAccountUsernameRequest = { username }
      const result = await client.post<ClaimAccountUsernameResponse>(
        "/api/v2/profile/username",
        body,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("upload-image")
    .description(
      "Request a presigned upload for a profile or banner image (returns an UploadContext)",
    )
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the UploadProfileImageRequest body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<UploadProfileImageRequest>(
        options.body,
        "--body",
      )
      const result = await client.post<UploadContext>(
        "/api/v2/profile/images",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("set-nft-pfp")
    .description("Set an owned, verified NFT as the profile picture")
    .argument("<contract_address>", "NFT contract address")
    .argument("<token_id>", "NFT token id")
    .argument("<chain>", "Chain the NFT lives on (e.g. ethereum, base)")
    .option("--collection-slug <slug>", "Collection slug of the NFT")
    .action(
      async (
        contractAddress: string,
        tokenId: string,
        chain: string,
        options: { collectionSlug?: string },
      ) => {
        const client = getClient()
        const body: SetNftPfpRequest = {
          contractAddress,
          tokenId,
          chain,
          ...(options.collectionSlug != null
            ? { collectionSlug: options.collectionSlug }
            : {}),
        }
        const result = await client.post<NftPfpResponse>(
          "/api/v2/profile/nft-pfp",
          body,
        )
        console.log(formatOutput(result, getFormat()))
      },
    )

  cmd
    .command("clear-nft-pfp")
    .description("Clear the NFT profile picture")
    .action(async () => {
      const client = getClient()
      const result = await client.delete<ClearNftPfpResponse>(
        "/api/v2/profile/nft-pfp",
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("create-shelf")
    .description("Create a profile shelf")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the CreateProfileShelfRequest body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<CreateProfileShelfRequest>(
        options.body,
        "--body",
      )
      const result = await client.post<ProfileShelfResponse>(
        "/api/v2/profile/shelves",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("reorder-shelves")
    .description("Reorder the authenticated wallet's profile shelves")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the ReorderProfileShelvesRequest body",
    )
    .action(async (options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<ReorderProfileShelvesRequest>(
        options.body,
        "--body",
      )
      const result = await client.patch<ProfileShelfActionResponse>(
        "/api/v2/profile/shelves",
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("update-shelf")
    .description("Update a profile shelf by id")
    .argument("<shelf_id>", "Shelf id to update")
    .requiredOption(
      "--body <path>",
      "Path to JSON file with the UpdateProfileShelfRequest body",
    )
    .action(async (shelfId: string, options: { body: string }) => {
      const client = getClient()
      const request = readJsonBodyOption<UpdateProfileShelfRequest>(
        options.body,
        "--body",
      )
      const result = await client.patch<ProfileShelfResponse>(
        `/api/v2/profile/shelves/${shelfId}`,
        request,
      )
      console.log(formatOutput(result, getFormat()))
    })

  cmd
    .command("delete-shelf")
    .description("Delete a profile shelf by id")
    .argument("<shelf_id>", "Shelf id to delete")
    .action(async (shelfId: string) => {
      const client = getClient()
      const result = await client.delete(`/api/v2/profile/shelves/${shelfId}`)
      console.log(formatOutput(result, getFormat()))
    })

  return cmd
}
