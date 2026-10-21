import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(0)
  @Max(65535)
  PORT: number = 4000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  /** Comma-separated list of allowed browser origins. */
  @IsString()
  CORS_ORIGINS: string = 'http://localhost:3000';

  /** Photo search: the local CLIP model indexes product photos and matches scans ("false" turns it off). */
  @IsOptional()
  @IsIn(['true', 'false'])
  IMAGE_SEARCH_ENABLED: 'true' | 'false' = 'true';

  /** Where the downloaded image model is cached (~90 MB, once). */
  @IsString()
  MODEL_CACHE_DIR: string = '.cache/models';

  /** Optional: Claude describes scanned photos so keyword matches add to the visual ones. */
  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  @IsString()
  ANTHROPIC_MODEL: string = 'claude-sonnet-5-5';

  /**
   * Behind a reverse proxy (nginx, Docker): how many proxy hops to trust for the client's IP
   * (X-Forwarded-For), e.g. "1", or an Express value like "loopback". Unset = no proxy. Without
   * it every visitor appears to come from the proxy, sharing one rate limit.
   */
  @IsOptional()
  @IsString()
  TRUST_PROXY?: string;

  /** Admin console origin, for links in emails (password reset). */
  @IsString()
  ADMIN_APP_URL: string = 'http://localhost:5173';

  @IsOptional()
  @IsString()
  MEILI_URL?: string;

  @IsOptional()
  @IsString()
  MEILI_MASTER_KEY?: string;

  /** Bunny storage zone holding all uploads (layout: modules/media/storage-keys.ts). */
  @IsOptional()
  @IsString()
  BUNNY_STORAGE_ZONE?: string;

  /** The storage zone's password (FTP & API access), not the account API key. */
  @IsOptional()
  @IsString()
  BUNNY_API_KEY?: string;

  /** Storage API endpoint for the zone's primary region, e.g. sg.storage.bunnycdn.com. */
  @IsOptional()
  @IsString()
  BUNNY_BASE_HOSTNAME?: string;

  /** Pull zone URL that public media keys resolve against, e.g. https://<zone>.b-cdn.net. */
  @IsOptional()
  @IsString()
  BUNNY_CDN_HOST?: string;

  /** OAuth client id(s) for "Sign in with Google"; comma-separated for web + mobile. */
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  /** Services id / bundle id(s) for "Sign in with Apple"; comma-separated. */
  @IsOptional()
  @IsString()
  APPLE_CLIENT_ID?: string;
}

export type Env = EnvironmentVariables;

export function validateEnv(config: Record<string, unknown>): Env {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment:\n${errors.toString()}`);
  }
  return validated;
}
