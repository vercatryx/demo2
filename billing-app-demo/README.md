# Client Food Service Billing Demo

Adapted copy of the [billing automation app](https://github.com/Poel-AI/bililngdf) for demoing against **Client Food Service** at [scn.demo.poel.ai](https://scn.demo.poel.ai/).

The original repo is unchanged in `../billing-app-original/`.

## Setup

1. Install and start:

   ```bash
   npm install
   npm run install-browsers   # first time only
   npm run dev                # http://localhost:3500
   ```

2. Triple-click the green **Connected** badge to open **Advanced** settings.

3. Enter your **Unite Us email and password** (Main account, and Brooklyn if needed), then click **Save settings**.

   Credentials are stored locally in `.env` on your machine. Password fields stay blank after save — leave blank to keep the saved password.

4. On the demo-food side, enable billing data (once per demo DB):

   ```bash
   cd ../demo-food
   npm run patch:demo-billing
   ```

## Usage

1. Open http://localhost:3500
2. Pick **Billing week starts** (defaults to last Monday)
3. Click **Download client list** — fetches from `GET /api/bill/invoices` on scn.demo.poel.ai
4. Select clients and click **Run billing**

## Demo safety defaults

- `DEMO_SAFE_QUEUE=true` — caps queue and replaces client names with demo personas
- `DEMO_SKIP_BILLING_SUBMIT=true` — fills forms but does not click Post on Unite Us
- Toggle **Submit invoice: Off** in advanced settings for the same effect via UI

Triple-click the green **Connected** badge to show advanced settings.
