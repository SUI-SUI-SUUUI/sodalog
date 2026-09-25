import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

// 起動時にgRPC接続を作らないよう、初めて使う時に生成する
let client: SecretManagerServiceClient | null = null;

function getClient(): SecretManagerServiceClient {
  if (!client) {
    client = new SecretManagerServiceClient();
  }
  return client;
}

function secretPath(projectId: string, secretName: string): string {
  return `projects/${projectId}/secrets/${secretName}`;
}

/**
 * シークレットの最新バージョンを読む。バージョンが1つも無い場合はnullを返す。
 */
export async function readLatestSecret(
  projectId: string,
  secretName: string
): Promise<string | null> {
  try {
    const [version] = await getClient().accessSecretVersion({
      name: `${secretPath(projectId, secretName)}/versions/latest`,
    });
    const data = version.payload?.data;
    if (!data) {
      return null;
    }
    return typeof data === "string" ? data : Buffer.from(data).toString("utf8");
  } catch (err) {
    // gRPCのNOT_FOUND(5) = バージョンが1つも無い
    if ((err as { code?: number }).code === 5) {
      return null;
    }
    throw err;
  }
}

/**
 * シークレットに新しいバージョンを追加し、そのバージョン番号を返す。
 */
export async function addSecretVersion(
  projectId: string,
  secretName: string,
  value: string
): Promise<string> {
  const [version] = await getClient().addSecretVersion({
    parent: secretPath(projectId, secretName),
    payload: { data: Buffer.from(value, "utf8") },
  });
  return (version.name ?? "").split("/").pop() ?? "";
}
