---
title: Org settings and payment providers
category: Admin
order: 740
routes: /admin/org-settings, /admin/payment-providers
keywords: organization settings org profile logo payment instructions check zelle paypal ach bank stripe quickbooks connect payment provider keys test live sandbox subscription plan upgrade
---
Two admin pages hold organization-wide settings: **Organization Settings** for your profile and payment instructions, and **Payment Providers** for card and online payment connections.

**Organization Settings ([open](/admin/org-settings)):**
1. Under **Organization Profile**, edit **Organization Name**, **Contact Email**, **Contact Phone**, **Website** and **Organization Logo** (**Upload Logo**).
2. Under **Payment Instructions**, fill in **Check** (**Payable To**, **Mailing Address**), **Zelle**, **PayPal** and **ACH / Bank Transfer**. These show on the public registration form when a team picks that payment method.
3. Click **Save Settings**.
**Subscription** shows your **Current Plan** and upgrade options.

**Payment Providers ([open](/admin/payment-providers)):** cards for **Stripe**, **QuickBooks** and **PayPal**, each marked **Connected**, **Disabled** or **Not connected**, and **Live** or **Test/Sandbox**.
1. Click **Connect** (or **Update Keys**).
2. Pick a **Mode:** **Live** or **Test / Sandbox**.
3. Enter the keys and click **Save Credentials**. For QuickBooks, enter the app details and click **Connect QuickBooks** to sign in.
4. Use **Disable** / **Enable** to turn a provider off or on.

**Common problems:**
- **Disconnect** asks to confirm and removes all stored keys for that provider.
- Never paste keys into chat or email. Enter them only on this page.
- Payment instructions are shown publicly to registering teams.
