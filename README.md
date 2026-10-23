![mySmartPass](banner.jpg)

# mySmartPass

A self-hosted digital hall pass app inspired by SmartPass, built as a hobby project.

## Overview

Students pick a destination, choose a duration, and get a timed pass with a live countdown.

## Setup

Secrets are never stored in `wrangler.jsonc`, because the repository is public. Set them on Cloudflare once:

```bash
npx wrangler secret put ACCESS_CODE
npx wrangler secret put PASSWORD_PIN
```

- `ACCESS_CODE`: the code teachers need to create an account or reset a password. Without it, teacher sign-up is off.
- `PASSWORD_PIN`: a 4-digit code for seeing or resetting a student's password. Without it, that feature is locked.
- `ADMIN_PASSWORD` (optional): sets the password of the `admin` teacher account.

For local testing, copy `.dev.vars.example` to `.dev.vars` and fill it in.

## Features

- You can go to anywhere, whenever.
- Insane accuracy, almost 1:1 to the real SmartPass.
- Updated 24/7
- Always unblocked**
