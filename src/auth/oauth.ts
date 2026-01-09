/**
 * OAuth 2.0 authentication flow for CLI
 * Implements the OAuth flow using a local server to receive the callback
 */

import {
  GOOGLE_AUTH_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  OAUTH_CALLBACK_PATH,
  OAUTH_CALLBACK_PORT,
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPES,
} from "../config/constants.ts";
import {
  deleteCredentials,
  loadCredentials,
  needsRefresh,
  saveCredentials,
  StoredCredentials,
} from "./credentials.ts";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

/**
 * Generate a random state parameter for CSRF protection
 */
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Build the Google OAuth authorization URL
 */
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "),
    state: state,
    access_type: "offline",
    prompt: "consent", // Force consent to always get refresh token
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: OAUTH_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }

  return (await response.json()) as TokenResponse;
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return (await response.json()) as TokenResponse;
}

/**
 * Fetch user info from Google
 */
async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch user info: ${error}`);
  }

  return (await response.json()) as UserInfo;
}

/**
 * Revoke tokens with Google
 */
async function revokeToken(token: string): Promise<void> {
  const response = await fetch(`${GOOGLE_REVOKE_URL}?token=${token}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  // Don't throw on error - token might already be revoked
  if (!response.ok) {
    console.warn("Warning: Could not revoke token with Google");
  }
}

/**
 * Start the OAuth login flow
 * Opens browser and waits for callback
 */
export async function login(): Promise<StoredCredentials> {
  const state = generateState();
  const authUrl = getAuthorizationUrl(state);

  // Create a promise that will be resolved when we receive the callback
  let resolveCallback: (code: string) => void;
  let rejectCallback: (error: Error) => void;

  const callbackPromise = new Promise<string>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  // Create a promise to know when server is ready
  let serverReady: () => void;
  const serverReadyPromise = new Promise<void>((resolve) => {
    serverReady = resolve;
  });

  // Start local server to receive callback
  const controller = new AbortController();
  const server = Deno.serve(
    {
      port: OAUTH_CALLBACK_PORT,
      signal: controller.signal,
      onListen: ({ port }) => {
        console.log(`\nCallback server listening on port ${port}...`);
        serverReady();
      },
    },
    (request) => {
      const url = new URL(request.url);

      if (url.pathname === OAUTH_CALLBACK_PATH) {
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          // Delay rejection to allow response to be sent
          setTimeout(() => rejectCallback(new Error(`OAuth error: ${error}`)), 100);
          return new Response(getErrorHtml(error), {
            headers: { "Content-Type": "text/html" },
          });
        }

        if (!code) {
          setTimeout(() => rejectCallback(new Error("No authorization code received")), 100);
          return new Response(getErrorHtml("No authorization code received"), {
            headers: { "Content-Type": "text/html" },
          });
        }

        if (returnedState !== state) {
          setTimeout(() => rejectCallback(new Error("State mismatch - possible CSRF attack")), 100);
          return new Response(getErrorHtml("Security error: state mismatch"), {
            headers: { "Content-Type": "text/html" },
          });
        }

        // Delay resolution to allow response to be sent
        setTimeout(() => resolveCallback(code), 100);
        return new Response(getSuccessHtml(), {
          headers: { "Content-Type": "text/html" },
        });
      }

      return new Response("Not found", { status: 404 });
    }
  );

  // Wait for server to be ready
  await serverReadyPromise;

  // Open browser
  console.log("Opening browser for authentication...");
  console.log(`If the browser doesn't open, visit this URL:\n${authUrl}\n`);

  // Don't await browser open - it can block on some systems
  openBrowser(authUrl);

  // Wait for callback
  console.log("Waiting for authentication... (press Ctrl+C to cancel)\n");
  let code: string;
  try {
    code = await callbackPromise;
  } finally {
    // Shutdown server after a small delay to ensure response is sent
    setTimeout(() => controller.abort(), 500);
    await server.finished.catch(() => {}); // Ignore abort error
  }

  // Exchange code for tokens
  console.log("Exchanging code for tokens...");
  const tokens = await exchangeCodeForTokens(code);

  // Fetch user info
  const userInfo = await fetchUserInfo(tokens.access_token);

  // Calculate expiration time
  const expiresAt = Date.now() + tokens.expires_in * 1000;

  // Create credentials object
  const credentials: StoredCredentials = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || "",
    expiresAt,
    tokenType: tokens.token_type,
    scope: tokens.scope,
    userEmail: userInfo.email,
    userName: userInfo.name,
    userId: userInfo.id,
  };

  // Save credentials
  await saveCredentials(credentials);

  return credentials;
}

/**
 * Logout - revoke tokens and delete local credentials
 */
export async function logout(): Promise<void> {
  const credentials = await loadCredentials();

  if (credentials) {
    // Try to revoke tokens with Google
    if (credentials.accessToken) {
      await revokeToken(credentials.accessToken);
    }
    if (credentials.refreshToken) {
      await revokeToken(credentials.refreshToken);
    }
  }

  // Delete local credentials
  await deleteCredentials();
}

/**
 * Get valid access token, refreshing if necessary
 */
export async function getAccessToken(): Promise<string> {
  const credentials = await loadCredentials();

  if (!credentials) {
    throw new Error("Not authenticated. Please run 'gtm auth login' first.");
  }

  // If token is still valid, return it
  if (!needsRefresh(credentials)) {
    return credentials.accessToken;
  }

  // If we don't have a refresh token, user needs to login again
  if (!credentials.refreshToken) {
    throw new Error("Session expired. Please run 'gtm auth login' again.");
  }

  // Refresh the token
  console.log("Refreshing access token...");
  const tokens = await refreshAccessToken(credentials.refreshToken);

  // Update stored credentials
  const updatedCredentials: StoredCredentials = {
    ...credentials,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    // Keep existing refresh token if new one not provided
    refreshToken: tokens.refresh_token || credentials.refreshToken,
  };

  await saveCredentials(updatedCredentials);

  return updatedCredentials.accessToken;
}

/**
 * Get current authentication status
 */
export async function getAuthStatus(): Promise<{
  authenticated: boolean;
  email?: string;
  name?: string;
  expiresAt?: Date;
  needsRefresh?: boolean;
}> {
  const credentials = await loadCredentials();

  if (!credentials) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    email: credentials.userEmail,
    name: credentials.userName,
    expiresAt: new Date(credentials.expiresAt),
    needsRefresh: needsRefresh(credentials),
  };
}

/**
 * Open URL in default browser
 */
async function openBrowser(url: string): Promise<void> {
  let cmd: string[];

  switch (Deno.build.os) {
    case "darwin":
      cmd = ["open", url];
      break;
    case "linux":
      cmd = ["xdg-open", url];
      break;
    case "windows":
      cmd = ["cmd", "/c", "start", url];
      break;
    default:
      console.log(`Please open this URL in your browser:\n${url}`);
      return;
  }

  try {
    const command = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdout: "null",
      stderr: "null",
    });
    await command.output();
  } catch {
    console.log(`Could not open browser. Please visit:\n${url}`);
  }
}

/**
 * HTML for successful authentication
 */
function getSuccessHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.1);
      border-radius: 1rem;
      backdrop-filter: blur(10px);
    }
    h1 { margin-bottom: 0.5rem; }
    p { opacity: 0.9; }
    .checkmark {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">✓</div>
    <h1>Authentication Successful!</h1>
    <p>You can close this window and return to the terminal.</p>
  </div>
</body>
</html>`;
}

/**
 * HTML for authentication error
 */
function getErrorHtml(error: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.1);
      border-radius: 1rem;
      backdrop-filter: blur(10px);
    }
    h1 { margin-bottom: 0.5rem; }
    p { opacity: 0.9; }
    .error-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">✗</div>
    <h1>Authentication Failed</h1>
    <p>${error}</p>
    <p>Please try again in the terminal.</p>
  </div>
</body>
</html>`;
}
