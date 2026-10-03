---
title: Record Stripe payments missing from the app
category: Registration & money
order: 470
routes: /staff/payments-reconcile
keywords: payment reconcile stripe missing payments webhook not recorded payment gap record it charged but not paid
---
Payment reconcile finds payments Stripe processed that never got recorded on a registration, and lets you record each one. This usually happens when the Stripe webhook has been switched off.

**Where:** open the **Review and record them** link in the payment alert email.

**To check and record payments:**
1. Pick a window: **Last 30 days**, **Last 60 days**, **Last 90 days** or **Last 180 days**. Click **Check again** to refresh.
2. If everything matches, you'll see **Everything Stripe charged is recorded**.
3. Otherwise each missing payment is listed with its date, who paid, **Card** or **Bank transfer**, and the amount.
4. Click **Record it** on each row.

**Common problems:**
- Recording uses the date Stripe took the payment, not today, and sends the usual payment heads-up email.
- It's safe to run twice. A payment already on file is skipped.
- To stop it happening again, click **Open Stripe webhooks** and turn the webhook back on.
