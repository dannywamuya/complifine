# Notifications

Pending records and evidence become in-app notifications. The list is the same to-do as the Records page: overdue and due templates, drafts and sent-back records, and upload-only evidence that is missing or out of date. A draft never counts as filed.

## Preferences

Each person has settings for their organisation (`notification_settings`) and one row per event and channel (`notification_preferences`). Until they save, the defaults apply: in-app, daily at 07:00 `Africa/Nairobi`, everything on except drafts, and due reminders only inside 7 days. **Email is opt-in** (off until Email is enabled in Settings); when on, the same event toggles apply to both channels and mail goes to the account email.

| Event | Meaning |
| --- | --- |
| `record_overdue` | A template is overdue and has no open draft |
| `record_due` | A template expires inside the lead window |
| `record_sent_back` | A record was rejected |
| `record_draft` | A draft is waiting to be filed |
| `evidence_missing` | Upload-only evidence is not on file |
| `evidence_expired` | Upload-only evidence is out of date |
| `daily_digest` | One summary per site |

`digest` is `daily`, `immediate` or `off`. Daily rows are inserted in the delivery hour, in the person's timezone. Immediate rows are inserted on the next 15-minute tick. Quiet hours suppress both. `off` and a disabled row insert nothing.

## Dedupe

One row per person per local day:

- item: `{eventType}:{siteId}:{subject}:{YYYY-MM-DD}`
- summary: `digest:{orgId}:{siteId}:{YYYY-MM-DD}`

The unique index is `(user_id, dedupe_key)`. Running the tick twice does not duplicate.

## Email (Resend)

`channelSenders.email` sends through Resend when both are set:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` — e.g. `CompliFine <notifications@your-verified-domain>`
- `APP_BASE_URL` — public web origin for absolute links (optional but recommended)

Without the key and from address, email preferences can be saved but nothing is sent. The destination is `notification_channel_endpoints` (upserted on save) or else `users.email`. In-app dedupe keys stay unchanged; email keys are prefixed (`email:…`) so both channels can land the same day.

Email delivers **one summary per site** (`daily_digest`) listing overdue, due, pending and missing items. It does not send a separate message for each row — those stay in-app only.

## Adding a channel

`in_app`, `email`, `sms` and `push` already exist on the tables. `notification_channel_endpoints` stores an address. Delivery is `channelSenders` in `apps/api/src/digest.ts`. Add a function for the channel. Only channels with a sender are inserted. Include the channel in the dedupe key when the same item should arrive on two channels the same day.

The scheduler starts with the API. `DIGEST_ENABLED=true` or `false` overrides the default, which is on outside production.
