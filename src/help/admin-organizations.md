---
title: Manage organizations (platform admin)
category: Admin
order: 730
routes: /admin, /admin/orgs, /admin/orgs/*
keywords: organizations orgs platform dashboard new org create organization owner team subscription plan whistle ready tournament whistle ready assigner feature switches turn on off registration scheduling scores game day money tasks website status branding logo slug payment details switch org member another organization head assigner
---
The **Platform Dashboard** and **Organizations** pages are for platform admins who run more than one customer organization.

**Where:** **Admin** → **Platform dashboard** in the top bar. Admin pages have tabs for **Platform dashboard**, **Organizations**, **Logins**, **Permissions**, **Roadmap** and **Payment providers**, and **Viewing** on the right switches organization. Each organization there shows its plan, and the eye next to it opens the app as its director sees it (see "See the app as an organization and role").

**The Platform Dashboard** shows totals (**Organizations**, **Tournaments**, **Staff Members**, **Users**), **Customer Organizations** and **Recent Tournaments**. Hover an org for **View Portal →**, **Website** and **Edit**.

**To create an organization:**
1. Go to **Organizations** and click **+ New Organization**.
2. Enter **Org Name**. The **Slug** fills in for you and becomes part of its web address.
3. Add **Contact Email**, pick a **Plan**, and optionally an **Owner Email** for an existing login. The owner runs the new organization (its **Tournament Director**, or **Head Assigner** on the Assigner plan) and keeps any organization they already work for.
4. Click **Create Organization**.

**To edit an organization:** click its name, change the **Branding**, **Contact** or **Payment Details** sections, then click **Save Changes**.

**Plans:**
- **Whistle Ready Tournament**: everything (registration, scheduling, officials, scores, game day, money and the website). Every organization without a plan is on this one.
- **Whistle Ready Assigner**: officials only. Events and their games, the **Assigner**, **Staff Pool**, availability, confirmations, time entries and staff pay. The person who runs it is called the **Head Assigner** (the director role, renamed): they create the events, import the games, add people and set pay. Their helpers are **Assigners**.

On the organization's page, the **Plan** section has both plans and a switch for each group: **Registration**, **Event setup & scheduling**, **Scores**, **Game-day tools**, **Event money**, **Tasks** and **Website & media**. Click a plan to start from its switches, then turn any group on or off for this organization only (an assigner who wants to run a tournament gets **Registration** and **Event setup & scheduling**, say). Each click saves; **Changed for this organization** shows when the switches differ from the plan. A group that is off leaves the menus and its pages for everyone in that organization, whatever their role. People already signed in get the change within a minute. Officials are always on.

**Setting up a Head Assigner:** pick **Whistle Ready Assigner** and leave every switch off. What they need is part of officials, so it's always on: **+ New Tournament** on their home page, the **Assigner** board with **Import schedule** (a TourneyMachine schedule or any spreadsheet) and **Add a game** (both in its **⋯** menu), the Staff Pool, availability, confirmations, time entries, and **Staff pay** with **Pay rates**. Turn on **Scores** only if their scorekeepers will enter scores in Whistle Ready, and **Game-day tools** only if they run game day. Leave **Event setup & scheduling** off unless they'll build schedules in Whistle Ready.

**Subscription status** sits under the plan and saves with **Save Changes**. The **Organizations** list shows each plan, with any switch changed (for example **Assigner + Scores**).

**To add people to an organization:**
1. Under **Team & owner**, enter **Add user by email** and pick a **Role**.
2. Tick **Make primary owner** if they should run it, then click **Add**.
3. Use **Make owner** or **Remove** on existing members.

Someone whose login already belongs to another organization keeps it: they get this one too (marked **home is another organization** on the list) and switch between them from the logo at the top left. **Remove** takes them out of this organization only. Admin logins are never changed from here.

**Common problems:**
- The user must already have an account. Create it first in **Logins**.
- Changing the slug changes the org's public web address.
- **Run DB Migration** and **Migrate: Flights** on the dashboard are maintenance tools. Do not use them unless asked.
