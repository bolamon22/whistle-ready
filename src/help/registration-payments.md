---
title: Record payments, refunds and pay links
category: Registration & money
order: 210
routes: /tournaments/*/registrations
keywords: payment record payment check zelle cash venmo paypal credit card ach refund pay link balance due paid in full quickbooks qb sync delete payment bank transfer clearing pending not funded processing
---
Each registration keeps its own payment history. Payments clubs make online are added automatically; you record checks, cash and other payments yourself.

**Where:** People → Team registrations

**To record a payment:**
1. On the club's row click **+ Payment** (or **+ Record Payment** in the expanded view). The balance is filled in for you.
2. Enter **Amount** and **Date Received**, and pick a **Method** (Check, Zelle, Credit Card, ACH Bank Transfer (QBO), PayPal, Venmo, Cash).
3. For a check, add the **Check #**. Add **Notes** if useful.
4. Click **Record Payment**.

Choosing **Credit Card**, **PayPal** or **ACH Bank Transfer (QBO)** charges the club right there instead of just logging a payment. ACH needs the account holder name, routing and account numbers, then **Submit ACH Payment**.

**To send a club a link to pay online:** click **Pay link** on its row. The link is copied so you can paste it into a text or email. It only shows while the club owes money.

**Bank transfers still clearing:** a club that pays by bank transfer (ACH) on the pay page has paid, but the money takes a few business days to land. Until it does:
- The club's card shows **Bank transfer clearing: $… · sent … · not funded yet** under the club name, and **Paid** includes it with "not funded" under the amount.
- Under **Received** at the top, **+$… clearing** adds them up. **Received** itself counts only money that has landed, and **Balance** already leaves the clearing money out.
- The club isn't on the **Owes** list for payment reminders, and its pay link and portal say the transfer is on its way instead of asking for it again.
- When the money lands, the payment records itself and the clearing line goes away. If the bank rejects the transfer, the line also goes away and the balance shows as owed again.

**To refund a card or bank payment:**
1. Expand the club and find the payment under **Invoice & Payments**.
2. Click **Refund**, enter the amount (partial is fine) and click **Refund**.

**To remove a payment entered by mistake:** click **Delete** next to it and confirm.

**To send the invoice to QuickBooks:** click **QB Sync**. Once done the row shows **QB synced**.

**Common problems:**
- **Refund** only appears on online card or bank payments. Refunds go back through Stripe; bank refunds take about 5-10 days.
- **Delete** does not send money back. It only removes the record.
- **Balance** is invoice minus discount minus payments, minus any bank transfer still clearing. If it looks wrong, check the **Invoice Amount** with **Edit**.
