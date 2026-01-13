# Privacy Policy for GTM CLI

**Effective Date:** January 13, 2026  
**Last Updated:** January 13, 2026

GTM CLI is a command-line interface for Google Tag Manager, developed and maintained by owntag GmbH ("we", "us", or "our"). This privacy policy explains how GTM CLI handles user data when you authenticate with Google.

## Data Accessed

When you authenticate GTM CLI with your Google account, the application requests access to the following data:

**Google Tag Manager Data:**
- Tag Manager account information
- Container configurations
- Workspaces, tags, triggers, and variables
- Container versions and publishing settings
- User permissions within Tag Manager

**Google Account Information:**
- Your email address
- Your display name

## How Your Data Is Used

GTM CLI uses the accessed data exclusively to:

- Execute commands you initiate against the Google Tag Manager API
- Display your email and name in the CLI to confirm your authenticated identity
- Authenticate API requests on your behalf

All operations are performed locally on your machine. GTM CLI acts as a client that communicates directly with Google's APIs based on your commands.

## Data Sharing

**GTM CLI does not share your data with any third parties.**

- No user data is transmitted to owntag GmbH or any other party
- No analytics or telemetry data is collected
- No usage data is tracked or reported
- All network communication occurs exclusively between your local machine and Google's official APIs

## Data Storage and Protection

GTM CLI stores authentication credentials locally on your machine:

- **Location:** `~/.config/gtm-cli/credentials.json` (Linux/macOS) or the equivalent application data directory on your operating system
- **Contents:** OAuth access token, refresh token, token expiration time, and basic profile information (email, name)
- **Protection:** Credential files are created with restrictive file permissions (readable only by your user account)

No data is stored on external servers. All credentials remain exclusively on your local device.

## Data Retention and Deletion

**Retention:** Authentication credentials are retained locally until you explicitly sign out or manually delete them.

**Deletion:** You can delete all stored data at any time by:

1. Running the logout command:
   ```
   gtm auth logout
   ```
   This revokes your tokens with Google and deletes all locally stored credentials.

2. Alternatively, manually deleting the configuration directory:
   ```
   rm -rf ~/.config/gtm-cli
   ```

Upon logout, GTM CLI also requests that Google revoke the issued tokens, ensuring your authorization is fully terminated.

## Open Source Transparency

GTM CLI is open source software. You can review exactly how your data is handled by examining the source code at:

https://github.com/owntag/gtm-cli

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in the "Last Updated" date above and published to the GTM CLI repository.

## Contact

If you have questions about this privacy policy or GTM CLI's data practices, please contact:

**owntag GmbH**  
Email: mail@owntag.eu  
Website: https://www.owntag.eu

---

*GTM CLI is not affiliated with or endorsed by Google. Google Tag Manager is a trademark of Google LLC.*