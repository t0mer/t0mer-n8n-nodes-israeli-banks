# n8n-nodes-israeli-banks

Israeli bank and credit-card transactions in [n8n](https://n8n.io) workflows.

This package is a thin client for **[Scipio](https://github.com/t0mer/scipio)**, a self-hosted REST API that wraps [`israeli-bank-scrapers`](https://github.com/eshaham/israeli-bank-scrapers). Scipio does the browser automation (Puppeteer and Chromium); these nodes only make HTTP calls to it. That is why the package has **no runtime dependencies** and runs on the standard n8n image.

> **You need a running Scipio instance.** The nodes do nothing without one.

- [Requirements](#requirements)
- [Installation](#installation)
- [Credentials](#credentials)
- [Israeli Bank node](#israeli-bank-node)
- [Israeli Bank Trigger node](#israeli-bank-trigger-node)
- [One Zero two-factor walkthrough](#one-zero-two-factor-walkthrough)
- [Example workflows](#example-workflows)
- [Security notes](#security-notes)
- [Development](#development)
- [Disclaimer](#disclaimer)

## Requirements

- n8n (self-hosted), with community nodes enabled.
- Scipio (`techblog/scipio` Docker image), reachable from n8n.

A minimal `docker-compose.yml` that runs both on a private network:

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    ports:
      - "5678:5678"
    volumes:
      - n8n-data:/home/node/.n8n
    restart: unless-stopped

  scipio:
    image: techblog/scipio:latest
    environment:
      API_TOKENS: "change-me-long-random-token"   # the API key for the Scipio API credential
    shm_size: '1gb'                                # Chromium needs shared memory
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    restart: unless-stopped
    # No published port: n8n reaches it at http://scipio:8080 on the compose network.

volumes:
  n8n-data:
```

In n8n, the Scipio API credential then uses **Base URL** `http://scipio:8080` and **API Key** `change-me-long-random-token`.

## Installation

In n8n, go to **Settings → Community Nodes → Install** and enter:

```
@t0mer/n8n-nodes-israeli-banks
```

This adds two nodes, **Israeli Bank** and **Israeli Bank Trigger**, and two credential types.

## Credentials

### Scipio API credential

Tells n8n how to reach your Scipio server. Every operation needs it.

| Field | Description |
|---|---|
| Base URL | Root URL of Scipio, for example `http://scipio:8080`. Leave out `/api/v1`. A trailing slash is fine. |
| API Key | One of the tokens in Scipio's `API_TOKENS`. It is sent as `Authorization: Bearer <key>`. Leave it empty if Scipio runs without tokens. |
| Ignore SSL Issues | Accept self-signed certificates (home-lab TLS). |

**Test** calls `GET /api/v1/companies`, which checks both the URL and the key.

### Israeli Bank Account credential

One bank or card login. Create one credential per account. First pick the **Bank or Card Company**; the form then shows only the fields that company needs.

| Company | Company ID | Fields |
|---|---|---|
| Bank Hapoalim (הפועלים) | `hapoalim` | User Code, Password |
| Bank Leumi (לאומי) | `leumi` | Username, Password |
| Mizrahi Tefahot (מזרחי טפחות) | `mizrahi` | Username, Password |
| Discount Bank (דיסקונט) | `discount` | ID Number, Password, User Identification Code (num) |
| Mercantile Bank (מרכנתיל) | `mercantile` | ID Number, Password, User Identification Code (num) |
| Otsar Hahayal (אוצר החייל) | `otsarHahayal` | Username, Password |
| Max (מקס) | `max` | Username, Password |
| Visa Cal (כאל) | `visaCal` | Username, Password |
| Isracard (ישראכרט) | `isracard` | ID Number, Card Last 6 Digits, Password |
| Amex Israel (אמריקן אקספרס) | `amex` | ID Number, Card Last 6 Digits, Password |
| Union Bank (איגוד) | `union` | Username, Password |
| First International / Beinleumi (הבינלאומי) | `beinleumi` | Username, Password |
| Massad (מסד) | `massad` | Username, Password |
| Bank Yahav (יהב) | `yahav` | Username, National ID, Password |
| Beyahad Bishvilha (ביחד בשבילך) | `beyahadBishvilha` | ID Number, Password |
| Behatsdaa (בהצדעה) | `behatsdaa` | ID Number, Password |
| Pagi (פאג"י) | `pagi` | Username, Password |
| One Zero (וואן זירו), experimental | `oneZero` | Email, Password, plus OTP Long-Term Token **or** Phone Number |

**Testing this credential never logs in to the bank.** A real login is slow, can send an SMS, and repeated attempts can lock the account. The **Test** button only checks that the company's required fields are filled in. The first real check is your first scrape.

## Israeli Bank node

Every operation needs the Scipio API credential. Operations that scrape (Transaction → Get Many, Job → Create) and the Two-Factor operations also need an Israeli Bank Account credential. The node can be used as a tool by AI agents.

### Transaction → Get Many

Runs a full scrape and returns the transactions. Scrapes usually take 30 seconds to 3 minutes. There are two ways to run it (**Scrape Method**):

- **Async Job (Recommended)**, the default: creates a Scipio job, polls it until it finishes, and fetches the result. Every request is short, so this is safe behind reverse proxies. On a timeout the job is cancelled, and OTP prompts are detected.
- **Synchronous Request**: a single `POST /api/v1/scrape` that waits for the whole scrape. It's simpler (one request, no polling), but:
  - A reverse proxy between n8n and Scipio may cut the connection.
  - **Max Wait Seconds** is the HTTP timeout. Scipio has its own limit, `SYNC_SCRAPE_TIMEOUT_SECONDS` (default 240), and returns 504 when it's reached. Set Max Wait Seconds above that limit to get Scipio's clearer error; otherwise the node gives up first and reports "Scipio did not respond within N seconds".
  - **Nothing is cancelled on a timeout.** The scrape keeps running on Scipio, so retrying right away logs in to the bank a second time.
  - It rejects 2FA companies (One Zero) that have no long-term token.

  Use it only when n8n reaches Scipio directly, for example on the same Docker network.

| Parameter | Description |
|---|---|
| Scrape Method | **Async Job (Recommended)** or **Synchronous Request** (see above). |
| Start Date Mode | **Lookback Days** (default) or **Fixed Date**. |
| Lookback Days | 1–365, default 30. |
| Start Date | Used with Fixed Date. |
| Output Mode | **Transactions**: one item per transaction, with `accountNumber` and `balance` merged in. **Accounts**: one item per account, with transactions nested under `txns`. **Raw**: one item holding Scipio's full, unfiltered result. |
| Status Filter | **Completed Only** (default), **Pending Only**, or **All**. Used by the Transactions and Accounts modes. |

**Options**

| Option | Description |
|---|---|
| Additional Transaction Information | Fetch extra details per transaction where the bank supports it (slower). |
| Combine Installments | Combine installment payments into one transaction. |
| Future Months to Scrape | Months ahead to scrape (card companies). |
| Include Raw Transaction | Add the bank's raw transaction object. |
| Opt-In Features | Library opt-in behaviours, loaded from Scipio. The `mizrahi:*` ones only affect Mizrahi. |
| Max Wait Seconds | Default 300. In Async Job mode, if the scrape hasn't finished by then, the node cancels the job and fails. With Synchronous Request, this is the HTTP timeout, and nothing is cancelled (see above). |
| Poll Interval Seconds | Default 5, minimum 2. Async Job only. |

**Output conventions**

- Dates are the library's ISO strings, unchanged. In the Transactions and Accounts modes, each transaction also gets **`date_local`** (`YYYY-MM-DD` in Asia/Jerusalem), because the library's timestamps are timezone-shifted: midnight in Israel shows up as 21:00 or 22:00 UTC the day before.
- Amounts are unchanged. A negative `chargedAmount` is a debit. Amounts can be `null` when the bank returns a non-numeric value.
- Every transaction item includes `companyId` and `accountNumber`.
- `futureDebits`, when the bank provides them, appear only in the Accounts and Raw modes.

**Errors**

| Scipio error type | Message |
|---|---|
| `INVALID_PASSWORD` | The bank rejected the login details. Check the Israeli Bank Account credential. |
| `CHANGE_PASSWORD` | The bank requires a password change. Log in on the bank's website first. |
| `ACCOUNT_BLOCKED` | The account is blocked. |
| `TIMEOUT` | The bank's site was slow, or an OTP wasn't submitted in time. |
| `TWO_FACTOR_RETRIEVER_MISSING` | Two-factor authentication is required (see One Zero below). |
| `GENERIC`, `GENERAL_ERROR` | The scrape failed. Check the Scipio logs. |

With Synchronous Request, the node can also fail with:
- HTTP **504**, when Scipio's sync limit is reached (switch to Async Job).
- "Scipio did not respond within N seconds", when Max Wait Seconds runs out first.
- **422 `TWO_FACTOR_REQUIRED`**, for One Zero without a long-term token.

In Async Job mode, if the job stops to wait for an OTP, Get Many cancels it (it holds a Scipio browser slot and can't be completed from there) and fails with a message explaining the manual Job flow. With **Continue On Fail** enabled, each failed item becomes `{ error, errorType, jobId }`. Error messages never include credential values.

### Company → Get Many

Lists the companies Scipio supports, one item each (`companyId`, `name`, `loginFields`, `requiresTwoFactor`).

### Job (advanced)

For manual async and OTP flows, for example combined with n8n's **Wait** node.

| Operation | Description |
|---|---|
| Create | Starts a scrape job and returns `{ jobId, status }` immediately. Takes the same start date and scraper options as Get Many. |
| Get Status | Returns the status (`queued`, `running`, `waiting_for_otp`, `succeeded` or `failed`), progress events and queue position. |
| Get Result | Returns Scipio's result. Fails with a clear message if the job is still running. Note that a failed bank login still has job status `succeeded`; check `success` and `errorType` in the result. |
| Submit OTP | Sends the one-time password to a job in `waiting_for_otp`. |
| Cancel | Deletes the job. |

Scipio drops finished jobs after its result TTL (15 minutes by default).

### Two-Factor (One Zero)

| Operation | Description |
|---|---|
| Send OTP | Sends an SMS code to the credential's Phone Number. |
| Get Long-Term Token | Exchanges the SMS code (**OTP Code**) for a long-term token. |

### System → Get Version

Returns Scipio's version, the scraper library version, and the build commit.

## Israeli Bank Trigger node

A polling trigger that starts the workflow for **new** transactions only.

| Parameter | Description |
|---|---|
| Event | **New Completed Transaction** (default) or **New Transaction (Including Pending)**. |
| Lookback Days | Default 7. The window scraped on every poll. Keep it longer than the poll interval so late-posting transactions are still caught. |
| Options | The scraper options above, plus **Emit Existing on First Run**. |

> **Poll every 4 hours or less often.** Banks rate-limit logins and may flag or block accounts that log in too frequently. Scipio also rate-limits job creation (10 per 15 minutes per token by default). n8n owns the schedule, so the node can't enforce this; set the interval yourself.

**How deduplication works**

- On each poll the trigger scrapes the lookback window. It keeps a key for every transaction it has already seen, stored in the workflow's static data.
- The key is `companyId|accountNumber|identifier|status`. When a transaction has no identifier, the key is built from its date, charged amount, description, memo and installment number instead.
- The status is part of the key. So:
  - **New Completed Transaction**: pending transactions are ignored, and each transaction is emitted once, when it completes.
  - **New Transaction (Including Pending)**: a transaction can be emitted **twice**, once while pending and again when completed.
- **First activation emits nothing.** The trigger records what is already in the window, so turning on the workflow doesn't flood it with history. Enable **Emit Existing on First Run** to change this.
- Keys older than lookback days + 14 are pruned, so the stored state stays small.
- **Manual test** (the "Fetch Test Event" button) returns up to the 5 most recent transactions and doesn't change the stored state.
- If a scrape fails, the trigger reports the error and leaves its state unchanged.
- **One Zero** needs an OTP Long-Term Token in the credential to be used with the trigger. Otherwise every poll would send an SMS that nobody can answer, so the trigger refuses to run.

## One Zero two-factor walkthrough

One Zero requires an SMS code on login. To avoid entering it every time, get a long-term token once:

1. Create an **Israeli Bank Account** credential with company **One Zero**. Fill in Email, Password and **Phone Number** (international format, e.g. `+972501234567`).
2. Add an **Israeli Bank** node: **Two-Factor → Send OTP**, using that credential. Run it; an SMS arrives.
3. Change the operation to **Two-Factor → Get Long-Term Token**, put the SMS code in **OTP Code**, and run it again (soon; Scipio keeps the pending session for a short time).
4. Copy `longTermTwoFactorAuthToken` from the output into the credential's **OTP Long-Term Token** field and save. The node never edits credentials itself.

The token is also stored in that execution's history. Delete the execution afterwards, or turn off saving successful executions for the workflow you use for this.

From then on, scrapes use the token and no SMS is needed. When a token is set, the phone number is ignored for scraping.

Without a token, a One Zero scrape stops at `waiting_for_otp`. Use **Job → Create**, then a **Wait** node (for example, "resume on webhook call" with the code), then **Job → Submit OTP** and **Job → Get Result**.

## Example workflows

Import these from [`examples/`](examples/) (**Workflows → Import from File**), then attach your own credentials:

| File | What it does |
|---|---|
| [`daily-transactions-to-google-sheets.json`](examples/daily-transactions-to-google-sheets.json) | The trigger polls once a day and appends each new completed transaction to a Google Sheet. Dedup means late-posting transactions are still added, and never twice. |
| [`new-card-transaction-telegram-alert.json`](examples/new-card-transaction-telegram-alert.json) | The trigger polls a card every 4 hours and sends a Telegram message per new transaction. |
| [`monthly-spend-summary-ai-agent.json`](examples/monthly-spend-summary-ai-agent.json) | On the 1st of the month, an AI Agent summarises last month's spending by category. |

## Security notes

- Bank credentials are stored **encrypted** in n8n's credential store. They are never node parameters, never logged, and never included in output.
- They are sent only to **your** Scipio server, in the body of `POST /api/v1/jobs`. Scipio scrubs them from a job once it finishes.
- Scipio keeps results **in memory only**, and only for a limited time (`JOB_RESULT_TTL_SECONDS`, 15 minutes by default).
- Error messages from Scipio are sanitised: fields named like `password`, `token`, `otp`, `id` or `card` are redacted, and any credential value found in the text is replaced.
- **Run Scipio on a private network.** Don't expose it to the internet. Always set `API_TOKENS`, and use HTTPS if traffic leaves the host.

## Development

```bash
npm ci
npm run lint        # n8n community-node lint rules
npm run build
npm run typecheck   # includes the tests
npm test            # vitest, no network access
npm run dev         # n8n with this package loaded at http://localhost:5678
```

For end-to-end testing, run Scipio locally (see the compose file above) and point the Scipio API credential at it. CI never talks to real banks.

Releases use date-based versions (`YYYY.M.PATCH`). `npm run release` tags the version, and the tag triggers the publish workflow, which publishes to npm with provenance and then runs `@n8n/scan-community-package` on the published package.

## Disclaimer

This is an **unofficial** project. It is not affiliated with, endorsed by, or connected to any bank or credit-card company. Scraping depends on the banks' websites and can break whenever they change. Use at your own risk, and check your bank's terms of service.

## License

[MIT](LICENSE)
