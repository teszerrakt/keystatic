import * as s from 'superstruct';
import { Config } from '../config';
import { authPlugin } from './klay/auth';

const storedTokenSchema = s.object({
  token: s.string(),
  project: s.string(),
  validUntil: s.coerce(s.date(), s.number(), val => new Date(val)),
});

export function getSyncAuth(config: Config) {
  if (typeof document === 'undefined') {
    return null;
  }
  if (config.storage.kind === 'github') {
    const accessToken = authPlugin(config.storage).getToken();
    return accessToken ? { accessToken } : null;
  }
  if (config.storage.kind === 'cloud') {
    return getCloudAuth(config);
  }
  return null;
}

export function getCloudAuth(config: Config) {
  if (!config.cloud?.project) return null;
  const unparsedTokenData = localStorage.getItem(
    'keystatic-cloud-access-token'
  );
  let tokenData;
  try {
    tokenData = storedTokenSchema.create(JSON.parse(unparsedTokenData!));
  } catch (err) {
    return null;
  }
  if (
    !tokenData ||
    tokenData.validUntil < new Date() ||
    tokenData.project !== config.cloud.project
  ) {
    return null;
  }
  return { accessToken: tokenData.token };
}

let _refreshTokenPromise: Promise<{ accessToken: string } | null> | undefined;

export async function getAuth(config: Config) {
  const token = getSyncAuth(config);

  if (config.storage.kind === 'github' && !token) {
    if (!_refreshTokenPromise) {
      _refreshTokenPromise = (async () => {
        try {
          if (config.storage.kind === 'github') {
            const accessToken = await authPlugin(config.storage).refresh();
            if (accessToken) return { accessToken };
          }
        } catch {
        } finally {
          _refreshTokenPromise = undefined;
        }
        return null;
      })();
    }
    return _refreshTokenPromise;
  }
  return token;
}
