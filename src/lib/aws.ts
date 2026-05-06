import { KMSClient } from '@aws-sdk/client-kms';
import { SSMClient } from '@aws-sdk/client-ssm';
import { STSClient } from '@aws-sdk/client-sts';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

/**
 * Use the AWS SDK default credential chain (env vars -> AWS_PROFILE -> SSO -> IMDS) as-is.
 * Credential resolution failures surface from the SDK on the first call (lazy resolve).
 */
export function createSsmClient(opts: { region: string }): SSMClient {
  return new SSMClient({ region: opts.region, credentials: fromNodeProviderChain() });
}

export function createStsClient(opts: { region: string }): STSClient {
  return new STSClient({ region: opts.region, credentials: fromNodeProviderChain() });
}

export function createKmsClient(opts: { region: string }): KMSClient {
  return new KMSClient({ region: opts.region, credentials: fromNodeProviderChain() });
}
