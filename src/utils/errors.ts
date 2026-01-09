/**
 * Error handling utilities
 */

import { colors } from "@cliffy/ansi/colors";

/**
 * Format an API error for display
 */
export function formatApiError(error: unknown): string {
  if (error instanceof Error) {
    // Check for Google API errors
    const googleError = error as { errors?: Array<{ message: string }> };
    if (googleError.errors && Array.isArray(googleError.errors)) {
      return googleError.errors.map((e) => e.message).join("\n");
    }

    // Check for response body in error
    const responseError = error as { response?: { data?: { error?: { message?: string } } } };
    if (responseError.response?.data?.error?.message) {
      return responseError.response.data.error.message;
    }

    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return String(error);
}

/**
 * Handle command errors consistently
 */
export function handleError(error: unknown): never {
  const message = formatApiError(error);
  console.error(colors.red("Error:"), message);
  Deno.exit(1);
}

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error);
    }
  };
}

/**
 * Validate required options
 */
export function requireOptions(
  options: Record<string, unknown>,
  required: string[]
): void {
  const missing = required.filter((key) => !options[key]);

  if (missing.length > 0) {
    const formatted = missing.map((k) => `--${k.replace(/([A-Z])/g, "-$1").toLowerCase()}`);
    throw new Error(`Missing required options: ${formatted.join(", ")}`);
  }
}
